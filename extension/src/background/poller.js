/* global JBSync */
const VERSION = "1.16.5"
const HEARTBEAT_ALARM = "jb-heartbeat"
const SYNC_ALARM = "jb-trade-sync"
const CAPTURE_SYNC_DEBOUNCE_MS = 120
const LOCAL_JOURNAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//
const JOURNAL_SCRIPT_ID = "jb-journal-bridge-dynamic"
const IMPORT_ALL_MAX_MS = 15 * 60 * 1000

importScripts("../lib/symbol-utils.js", "../lib/sync-client.js")

let syncInFlight = false
let importAllInFlight = false
let importAllWatchdog = null
let refreshInFlight = false
let captureSyncTimer = null
let captureSyncPending = false
let pendingCapturePayload = null
let lastJournalSyncAt = 0
let lastTableSyncAt = 0
let lastRefreshCheckAt = 0
const JOURNAL_SYNC_MIN_MS = 3_000
const TABLE_SYNC_MIN_MS = 350
const REFRESH_CHECK_MIN_MS = 5_000

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForSyncIdle(timeoutMs = 45_000) {
  const started = Date.now()
  while (syncInFlight && Date.now() - started < timeoutMs) {
    await sleep(200)
  }
  return !syncInFlight
}

async function isImportAllBlocking() {
  if (importAllInFlight) return true
  return JBSync.isImportAllLockActive()
}

async function beginImportAllLock() {
  importAllInFlight = true
  await JBSync.markImportAllLock(true, IMPORT_ALL_MAX_MS)
  if (importAllWatchdog) clearTimeout(importAllWatchdog)
  importAllWatchdog = setTimeout(() => {
    importAllInFlight = false
    importAllWatchdog = null
    void JBSync.markImportAllLock(false)
  }, IMPORT_ALL_MAX_MS)
}

async function endImportAllLock() {
  importAllInFlight = false
  if (importAllWatchdog) {
    clearTimeout(importAllWatchdog)
    importAllWatchdog = null
  }
  await JBSync.markImportAllLock(false)
}

function drainPendingCapture() {
  if (pendingCapturePayload) {
    const pending = pendingCapturePayload
    pendingCapturePayload = null
    captureSyncPending = false
    void syncCapturePayload(pending)
  } else if (captureSyncPending) {
    captureSyncPending = false
    scheduleCaptureSync()
  }
}

async function journalOrigin() {
  try {
    const config = await JBSync.getConfig()
    return new URL(config.apiUrl).origin
  } catch {
    return ""
  }
}

async function isJournalTabUrl(url) {
  if (!url) return false
  if (LOCAL_JOURNAL_URL.test(url)) return true
  const origin = await journalOrigin()
  return Boolean(origin) && url.startsWith(origin)
}

/**
 * Static manifest matches only cover localhost + *.vercel.app.
 * Custom production domains need the bridge registered at runtime, after the
 * user grants the optional host permission in Options.
 */
async function ensureJournalBridgeRegistration() {
  const config = await JBSync.getConfig()
  const pattern = JBSync.journalOriginPattern(config.apiUrl)
  if (LOCAL_JOURNAL_URL.test(pattern) || /\/\/[^/]*\.vercel\.app\//.test(pattern)) return

  const granted = await chrome.permissions.contains({ origins: [pattern] }).catch(() => false)
  if (!granted) return

  const existing = await chrome.scripting
    .getRegisteredContentScripts({ ids: [JOURNAL_SCRIPT_ID] })
    .catch(() => [])
  if (existing[0]?.matches?.includes(pattern)) return
  if (existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [JOURNAL_SCRIPT_ID] }).catch(() => {})
  }

  await chrome.scripting
    .registerContentScripts([
      {
        id: JOURNAL_SCRIPT_ID,
        matches: [pattern],
        js: ["src/content/journal-bridge.js"],
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ])
    .catch(() => {})
}

async function injectJournalBridge(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/journal-bridge.js"],
    })
  } catch {
    // Bridge may already be present or tab not injectable.
  }
}

/** Inject hooks into an already-open TV tab — no manual F5 required. */
async function injectTvHooks(tabId) {
  if (!tabId) return
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      files: ["src/content/main-hook.js"],
    })
  } catch {
    // ignore
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["src/content/tv-capture-relay.js"],
    })
  } catch {
    // ignore
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: false },
      files: ["src/content/tv-poller.js", "src/content/tv-trade-watcher.js"],
    })
  } catch {
    // ignore
  }
}

async function injectHooksOnOpenTvTabs() {
  try {
    const tabs = await chrome.tabs.query({
      url: ["*://*.tradingview.com/*", "*://tradingview.com/*"],
    })
    for (const tab of tabs) {
      if (!tab.id || !tab.url?.includes("/chart")) continue
      await JBSync.rememberTvChartTab(tab.id)
      await injectTvHooks(tab.id)
    }
  } catch {
    // ignore
  }
}

async function injectBridgeOnJournalTabs() {
  try {
    const config = await JBSync.getConfig()
    const origin = JBSync.journalOriginPattern(config.apiUrl)
    const tabs = await chrome.tabs.query({
      url: origin ? [origin] : ["http://localhost/*", "http://127.0.0.1/*"],
    })
    for (const tab of tabs) {
      if (tab.id) void injectJournalBridge(tab.id)
    }
  } catch {
    // ignore
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    void (async () => {
      if (await isJournalTabUrl(tab.url)) await injectJournalBridge(tabId)
    })()
  }
  if (tab.url && JBSync.isTradingViewChartTab(tab) && (changeInfo.status === "complete" || changeInfo.url)) {
    void JBSync.rememberTvChartTab(tabId)
    if (changeInfo.status === "complete") {
      void injectTvHooks(tabId)
    }
  }
})

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void JBSync.rememberTvChartTab(tabId)
})

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, windowId })
    if (tab?.id) await JBSync.rememberTvChartTab(tab.id)
  })()
})

async function runRefreshCheck() {
  if (refreshInFlight) return
  if (await isImportAllBlocking()) {
    try {
      const config = await JBSync.getConfig()
      if (config.syncToken) await JBSync.sendHeartbeat(config).catch(() => {})
    } catch {
      // ignore
    }
    return
  }

  refreshInFlight = true
  lastRefreshCheckAt = Date.now()
  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) return
    // Heartbeat has its own 15s floor — safe to call every time.
    await JBSync.sendHeartbeat(config).catch(() => {})
    // Always process Live Sync "request refresh" queues. Do not early-return
    // before this or the page poll looks dead while refresh-status stays pending.
    await JBSync.maybeRunRequestedRefresh(config)
  } catch (error) {
    console.warn("Refresh check failed:", error?.message || error)
  } finally {
    refreshInFlight = false
  }
}

function startRefreshChecker() {
  void runRefreshCheck()
  // Timer itself is the throttle (was also early-returning inside and skipping queues).
  setInterval(() => {
    void runRefreshCheck()
  }, REFRESH_CHECK_MIN_MS)
}

startRefreshChecker()

async function sendHeartbeatIfConfigured() {
  const config = await JBSync.getConfig()
  if (!config.syncToken) return
  await JBSync.sendHeartbeat(config)
  await runRefreshCheck()
}

async function runAutoSync(source) {
  if (importAllInFlight || (await isImportAllBlocking())) {
    if (
      source === "capture" ||
      source === "alarm" ||
      source === "journal" ||
      source === "table"
    ) {
      captureSyncPending = true
    }
    return null
  }

  if (syncInFlight) {
    if (
      source === "capture" ||
      source === "alarm" ||
      source === "journal" ||
      source === "table"
    ) {
      captureSyncPending = true
    }
    return null
  }

  syncInFlight = true
  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) return null

    // Always sync for capture/alarm/journal/refresh. Poll respects autoSyncTrades.
    const forceSync = source !== "poll"
    if (!forceSync && !config.autoSyncTrades) return null

    await JBSync.sendHeartbeat(config)
    await JBSync.maybeRunRequestedRefresh(config).catch(() => {})

    const tab = await JBSync.getTradingViewTab()
    if (!tab?.id) {
      console.warn(`${source} sync skipped: no TradingView chart tab`)
      return null
    }

    const result = await JBSync.refreshNewTrades(config)
    if (result?.imported > 0 || result?.updated > 0) {
      console.info(`${source} sync ok:`, result.imported, "imported,", result.updated, "updated")
    }
    return result
  } catch (error) {
    console.warn(`${source} sync failed:`, error?.message || error)
    return null
  } finally {
    syncInFlight = false
    drainPendingCapture()
  }
}

/** Instant open/exit path — POST captured trades and ping journal UI immediately. */
async function syncCapturePayload(payload) {
  if (importAllInFlight || (await isImportAllBlocking())) {
    pendingCapturePayload = payload
    captureSyncPending = true
    return null
  }

  if (syncInFlight) {
    pendingCapturePayload = payload
    captureSyncPending = true
    return null
  }

  const config = await JBSync.getConfig()
  if (!config.syncToken) return null

  const trades = Array.isArray(payload?.trades)
    ? payload.trades
    : (payload?.changes || []).map((c) => c?.trade).filter(Boolean)
  const closedHint = (payload?.changes || []).some(
    (change) => change?.reason === "closed" || change?.isOpen === false,
  )
  const newHint = (payload?.changes || []).some((change) => change?.reason === "new")

  syncInFlight = true
  try {
    if (trades.length) {
      try {
        const result = await JBSync.syncCapturedTrades(config, trades, payload?.chartSymbol)
        if (result?.imported > 0 || result?.updated > 0 || result?.closedStale > 0) {
          console.info(
            "instant capture sync:",
            result.imported,
            "new,",
            result.updated,
            "updated,",
            result.closedStale || 0,
            "closed",
          )
          return result
        }
      } catch (error) {
        console.warn("instant capture sync failed:", error?.message || error)
      }
    }
  } finally {
    syncInFlight = false
    if (pendingCapturePayload) {
      const pending = pendingCapturePayload
      pendingCapturePayload = null
      captureSyncPending = false
      void syncCapturePayload(pending)
      return null
    }
  }

  if (closedHint || newHint) {
    return runAutoSync("capture")
  }

  scheduleCaptureSync()
  return null
}

async function handlePollTick(autoSync) {
  if (await isImportAllBlocking()) {
    try {
      const config = await JBSync.getConfig()
      if (config.syncToken) await JBSync.sendHeartbeat(config)
    } catch {
      // ignore — Import All owns the table
    }
    return
  }

  if (!autoSync) {
    try {
      const config = await JBSync.getConfig()
      if (!config.syncToken) return
      await JBSync.sendHeartbeat(config)
      await JBSync.maybeRunRequestedRefresh(config).catch(() => {})
    } catch (error) {
      console.warn("Poll heartbeat failed:", error?.message || error)
    }
    return
  }

  await runAutoSync("poll")
}

function scheduleCaptureSync() {
  if (captureSyncTimer) clearTimeout(captureSyncTimer)
  captureSyncTimer = setTimeout(() => {
    captureSyncTimer = null
    void runAutoSync("capture")
  }, CAPTURE_SYNC_DEBOUNCE_MS)
}

chrome.runtime.onInstalled.addListener(() => {
  void syncAlarmFromSettings()
  void sendHeartbeatIfConfigured()
  void ensureJournalBridgeRegistration()
  void injectBridgeOnJournalTabs()
  void injectHooksOnOpenTvTabs()
})

chrome.runtime.onStartup.addListener(() => {
  void syncAlarmFromSettings()
  void ensureJournalBridgeRegistration()
  void injectBridgeOnJournalTabs()
  void injectHooksOnOpenTvTabs()
})

void ensureJournalBridgeRegistration()
// SW can wake without onStartup — re-arm alarms so poll backup never goes missing.
void syncAlarmFromSettings()

// Keep hooks alive on open TV tabs without asking the user to refresh.
void injectHooksOnOpenTvTabs()
setInterval(() => {
  void injectHooksOnOpenTvTabs()
}, 30_000)

async function syncAlarmFromSettings() {
  const stored = await chrome.storage.sync.get(["pollIntervalSeconds", "syncToken", "autoSyncTrades"])
  const seconds = Number(stored.pollIntervalSeconds) || 0
  const configured = Boolean((stored.syncToken || "").trim())
  const autoSync = stored.autoSyncTrades === undefined ? true : Boolean(stored.autoSyncTrades)
  await chrome.alarms.clear(HEARTBEAT_ALARM)
  await chrome.alarms.clear(SYNC_ALARM)

  if (!configured) return

  // Always ping while sync key is set — even when auto-sync poll is Off.
  const periodInMinutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 1
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes })

  // MV3 content-script timers throttle when TV is in background — alarm keeps syncing.
  if (autoSync) {
    chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 })
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return
  if (changes.pollIntervalSeconds || changes.syncToken || changes.autoSyncTrades) {
    void syncAlarmFromSettings()
  }
  if (changes.apiUrl) {
    void ensureJournalBridgeRegistration()
    void injectBridgeOnJournalTabs()
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === HEARTBEAT_ALARM) {
    void sendHeartbeatIfConfigured()
    return
  }
  if (alarm.name === SYNC_ALARM) {
    void runAutoSync("alarm")
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true, version: VERSION })
    return false
  }

  if (message.type === "REGISTER_JOURNAL_BRIDGE") {
    void (async () => {
      await ensureJournalBridgeRegistration()
      await injectBridgeOnJournalTabs()
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message.type === "POLL_TICK") {
    void (async () => {
      try {
        // Prefer storage default (true when unset) over a stale false from older content scripts.
        const config = await JBSync.getConfig()
        await handlePollTick(config.autoSyncTrades)
        sendResponse({ ok: true })
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Poll failed" })
      }
    })()
    return true
  }

  if (message.type === "TV_TABLE_CHANGED") {
    // Import All scrolls the same table — do not start a light scrape mid-import.
    if (importAllInFlight) {
      sendResponse({ ok: true, skipped: true })
      return false
    }
    // List of trades DOM changed — sync fast for open/exit UI update.
    if (Date.now() - lastTableSyncAt >= TABLE_SYNC_MIN_MS) {
      lastTableSyncAt = Date.now()
      void runAutoSync("table")
    } else {
      scheduleCaptureSync()
    }
    sendResponse({ ok: true })
    return false
  }

  if (message.type === "TRADE_CAPTURED") {
    void syncCapturePayload(message)
    sendResponse({ ok: true })
    return false
  }

  if (message.type === "HEARTBEAT_TICK") {
    void (async () => {
      try {
        const config = await JBSync.getConfig()
        if (config.syncToken) await JBSync.sendHeartbeat(config)
        sendResponse({ ok: true })
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Heartbeat failed" })
      }
    })()
    return true
  }

  if (message.type === "CHECK_REFRESH_REQUEST") {
    void (async () => {
      if (await isImportAllBlocking()) {
        try {
          const config = await JBSync.getConfig()
          if (config.syncToken) await JBSync.sendHeartbeat(config)
        } catch {
          // ignore
        }
        sendResponse({ ok: true, skipped: true })
        return
      }
      await runRefreshCheck()
      // Journal tab wake — throttled trade sync (TV content timers often sleep in background).
      if (Date.now() - lastJournalSyncAt >= JOURNAL_SYNC_MIN_MS) {
        lastJournalSyncAt = Date.now()
        await runAutoSync("journal")
      }
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message.type === "BEGIN_IMPORT_ALL") {
    void (async () => {
      try {
        if (importAllInFlight) {
          sendResponse({ ok: false, error: "Import all already running" })
          return
        }
        // Block new polls immediately, then wait for any light scrape already in flight.
        importAllInFlight = true
        await waitForSyncIdle(45_000)
        if (syncInFlight) {
          importAllInFlight = false
          sendResponse({ ok: false, error: "Live sync is busy. Wait a moment and retry Import All." })
          return
        }
        await beginImportAllLock()
        sendResponse({ ok: true })
      } catch (error) {
        importAllInFlight = false
        await JBSync.markImportAllLock(false).catch(() => {})
        sendResponse({ ok: false, error: error?.message || "Could not start Import all" })
      }
    })()
    return true
  }

  if (message.type === "END_IMPORT_ALL") {
    void (async () => {
      try {
        const config = await JBSync.getConfig()
        if (message.result && config.syncToken) {
          await JBSync.completeRefreshRequest(config, message.result).catch(() => {})
        }
        await endImportAllLock()
        drainPendingCapture()
        sendResponse({ ok: true })
      } catch (error) {
        await endImportAllLock().catch(() => {})
        sendResponse({ ok: false, error: error?.message || "Could not finish Import all" })
      }
    })()
    return true
  }

  if (message.type === "TEST_SCRAPE") {
    void (async () => {
      try {
        if (await isImportAllBlocking()) {
          sendResponse({ trades: [], error: "Import all is running — try Test scrape after it finishes" })
          return
        }
        await waitForSyncIdle(15_000)
        if (syncInFlight || importAllInFlight) {
          sendResponse({ trades: [], error: "Live sync is busy. Retry in a moment." })
          return
        }
        syncInFlight = true
        try {
          const result = await JBSync.scrapeFromActiveTab(false)
          sendResponse(result)
        } finally {
          syncInFlight = false
          drainPendingCapture()
        }
      } catch (error) {
        sendResponse({ trades: [], error: error?.message || "Scrape failed" })
      }
    })()
    return true
  }

  if (message.type === "REFRESH_NEW_TRADES" || message.type === "RELOAD_TV_AND_SYNC") {
    void (async () => {
      try {
        if (await isImportAllBlocking()) {
          sendResponse({
            ok: false,
            error: "Import all in progress",
            paused: true,
          })
          return
        }

        const config = await JBSync.getConfig()
        if (!config.syncToken) {
          sendResponse({ ok: false, error: "Add sync key in extension Options" })
          return
        }

        const tab = await JBSync.getTradingViewTab()
        if (!tab?.id) {
          sendResponse({
            ok: false,
            error: "TradingView chart tab not found. Keep tradingview.com/chart open.",
          })
          return
        }

        await waitForSyncIdle(15_000)
        if (syncInFlight) {
          sendResponse({ ok: false, error: "Live sync is busy. Retry in a moment." })
          return
        }

        syncInFlight = true
        let syncResult
        try {
          syncResult =
            message.type === "RELOAD_TV_AND_SYNC"
              ? await JBSync.refreshNewTradesAfterTvReload(config)
              : await (async () => {
                  await injectTvHooks(tab.id)
                  return JBSync.refreshNewTrades(config)
                })()
        } finally {
          syncInFlight = false
        }

        if (!syncResult?.paused) {
          await JBSync.completeRefreshRequest(config, syncResult).catch(() => {})
        }
        sendResponse({ ok: !syncResult?.error, ...syncResult })
        drainPendingCapture()
      } catch (error) {
        syncInFlight = false
        sendResponse({ ok: false, error: error?.message || "Sync failed" })
        drainPendingCapture()
      }
    })()
    return true
  }

  sendResponse({ ok: false, error: "Unknown message type" })
  return false
})
