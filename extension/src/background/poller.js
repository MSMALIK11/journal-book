/* global JBSync */
const VERSION = "1.14.1"
const HEARTBEAT_ALARM = "jb-heartbeat"
const CAPTURE_SYNC_DEBOUNCE_MS = 1200
const JOURNAL_URL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//

importScripts("../lib/symbol-utils.js", "../lib/sync-client.js")

let syncInFlight = false
let refreshInFlight = false
let captureSyncTimer = null
let captureSyncPending = false

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

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && JOURNAL_URL.test(tab.url)) {
    void injectJournalBridge(tabId)
  }
  if (tab.url && JBSync.isTradingViewChartTab(tab) && (changeInfo.status === "complete" || changeInfo.url)) {
    void JBSync.rememberTvChartTab(tabId)
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
  refreshInFlight = true
  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) return
    await JBSync.sendHeartbeat(config).catch(() => {})
    await JBSync.maybeRunRequestedRefresh(config)
  } catch (error) {
    console.warn("Refresh check failed:", error?.message || error)
  } finally {
    refreshInFlight = false
  }
}

function startRefreshChecker() {
  void runRefreshCheck()
  setInterval(() => {
    void runRefreshCheck()
  }, 2000)
}

startRefreshChecker()

async function sendHeartbeatIfConfigured() {
  const config = await JBSync.getConfig()
  if (!config.syncToken) return
  await JBSync.sendHeartbeat(config)
  await runRefreshCheck()
}

async function runAutoSync(source) {
  if (syncInFlight) {
    if (source === "capture") captureSyncPending = true
    return null
  }

  syncInFlight = true
  try {
    const config = await JBSync.getConfig()
    if (!config.syncToken) return null
    if (!config.autoSyncTrades) return null

    await JBSync.sendHeartbeat(config)
    await JBSync.maybeRunRequestedRefresh(config).catch(() => {})

    const tab = await JBSync.getTradingViewTab()
    if (!tab?.id) return null

    return await JBSync.refreshNewTrades(config)
  } catch (error) {
    console.warn(`${source} sync failed:`, error?.message || error)
    return null
  } finally {
    syncInFlight = false
    if (captureSyncPending) {
      captureSyncPending = false
      scheduleCaptureSync()
    }
  }
}

async function handlePollTick(autoSync) {
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
  void chrome.tabs.query({ url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"] }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) void injectJournalBridge(tab.id)
    }
  })
})

chrome.runtime.onStartup.addListener(() => {
  void syncAlarmFromSettings()
  void chrome.tabs.query({ url: ["http://localhost:3000/*", "http://127.0.0.1:3000/*"] }).then((tabs) => {
    for (const tab of tabs) {
      if (tab.id) void injectJournalBridge(tab.id)
    }
  })
})

async function syncAlarmFromSettings() {
  const stored = await chrome.storage.sync.get(["pollIntervalSeconds", "syncToken"])
  const seconds = Number(stored.pollIntervalSeconds) || 0
  const configured = Boolean((stored.syncToken || "").trim())
  await chrome.alarms.clear(HEARTBEAT_ALARM)

  if (!configured) return

  // Always ping while sync key is set — even when auto-sync poll is Off.
  const periodInMinutes = seconds > 0 ? Math.max(1, Math.ceil(seconds / 60)) : 1
  chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes })
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && (changes.pollIntervalSeconds || changes.syncToken)) {
    void syncAlarmFromSettings()
  }
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== HEARTBEAT_ALARM) return
  void sendHeartbeatIfConfigured()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true, version: VERSION })
    return false
  }

  if (message.type === "POLL_TICK") {
    void handlePollTick(Boolean(message.autoSync))
    sendResponse({ ok: true })
    return false
  }

  if (message.type === "TRADE_CAPTURED") {
    scheduleCaptureSync()
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
      await runRefreshCheck()
      sendResponse({ ok: true })
    })()
    return true
  }

  if (message.type === "REFRESH_NEW_TRADES") {
    void (async () => {
      try {
        const config = await JBSync.getConfig()
        if (!config.syncToken) {
          sendResponse({ ok: false, error: "Add sync key in extension Options" })
          return
        }

        const tab = await JBSync.getTradingViewTab()
        if (!tab?.id) {
          sendResponse({
            ok: false,
            error: "TradingView chart tab not found. Open tradingview.com/chart and refresh (F5).",
          })
          return
        }

        const syncResult = await JBSync.refreshNewTrades(config)
        await JBSync.completeRefreshRequest(config, syncResult).catch(() => {})
        sendResponse({ ok: true, ...syncResult })
      } catch (error) {
        sendResponse({ ok: false, error: error?.message || "Sync failed" })
      }
    })()
    return true
  }

  sendResponse({ ok: false, error: "Unknown message type" })
  return false
})
