// Shared scrape helpers — loaded by popup (script tag) and background (importScripts).
var JBSync = (globalThis.JBSync = globalThis.JBSync || {})

JBSync.IMPORT_ALL_LOCK_MS = 15 * 60 * 1000

JBSync.markImportAllLock = async function markImportAllLock(active, ttlMs) {
  const until = active ? Date.now() + (Number(ttlMs) > 0 ? Number(ttlMs) : JBSync.IMPORT_ALL_LOCK_MS) : 0
  try {
    await chrome.storage.session.set({ jbImportAllUntil: until })
  } catch {
    await chrome.storage.local.set({ jbImportAllUntil: until })
  }
}

JBSync.isImportAllLockActive = async function isImportAllLockActive() {
  let until = 0
  try {
    const stored = await chrome.storage.session.get("jbImportAllUntil")
    until = Number(stored.jbImportAllUntil) || 0
  } catch {
    const stored = await chrome.storage.local.get("jbImportAllUntil")
    until = Number(stored.jbImportAllUntil) || 0
  }
  return until > Date.now()
}

JBSync.tradeKey = function tradeKey(trade) {
  const inst = (trade.instrument || "UNK").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const entry = trade.entry?.datetime || ""
  return `${inst}|${entry}|${trade.direction}|${trade.tradeNumber}`
}

JBSync.normalizeTradingViewDatetime = function normalizeTradingViewDatetime(value) {
  let s = String(value).replace(/\s+/g, " ").trim()
  s = s.replace(/,\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i, " $1")
  return s
}

JBSync.strategySlug = function strategySlug(strategy) {
  return (
    (strategy || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "strategy"
  )
}

JBSync.buildExternalId = function buildExternalId(trade) {
  const slug = JBSync.strategySlug(trade.strategy || "")
  const symbol = (trade.instrument || "UNKNOWN").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const entry = JBSync.normalizeTradingViewDatetime(trade.entry?.datetime || "")
  const entryMs = new Date(entry).getTime()
  if (Number.isFinite(entryMs) && entryMs > 0) {
    return `tv:${slug}:${symbol}:${entryMs}:${trade.direction}`
  }
  return `tv:${slug}:${trade.tradeNumber}`
}

JBSync.tradeKnownOnServer = function tradeKnownOnServer(trade, knownIds) {
  if (knownIds.has(JBSync.buildExternalId(trade))) return true
  return knownIds.has(`tv:${JBSync.strategySlug(trade.strategy || "")}:${trade.tradeNumber}`)
}

JBSync.isTypedExitTrade = function isTypedExitTrade(trade) {
  return /\bexit\s+(long|short)\b/i.test(
    `${trade?.exit?.signal || ""} ${trade?.entry?.signal || ""}`,
  )
}

JBSync.isLiteralOpenToken = function isLiteralOpenToken(value) {
  return /^open$/i.test(String(value || "").trim())
}

JBSync.isOpenTrade = function isOpenTrade(trade) {
  if (!trade?.exit) return true
  return (
    JBSync.isLiteralOpenToken(trade.exit.signal) ||
    JBSync.isLiteralOpenToken(trade.entry?.signal) ||
    JBSync.isLiteralOpenToken(trade.exit.datetime)
  )
}

JBSync.preferMergedTrade = function preferMergedTrade(prev, next) {
  if (!prev) return next
  if (!next) return prev
  if (JBSync.isOpenTrade(next) && !JBSync.isOpenTrade(prev)) return next
  if (JBSync.isOpenTrade(prev) && !JBSync.isOpenTrade(next)) return prev
  return next
}

/** Pass-through. Do not coerce the latest closed TP/SL row back to Open. */
JBSync.markLatestPaintedOpens = function markLatestPaintedOpens(trades) {
  return Array.isArray(trades) ? trades : []
}

JBSync.tradeEntryMs = function tradeEntryMs(trade) {
  const raw = trade?.entry?.datetime
  if (!raw) return NaN
  const ms = new Date(JBSync.normalizeTradingViewDatetime(raw)).getTime()
  return Number.isFinite(ms) ? ms : NaN
}

/**
 * Drop ghost "Open" rows that sit in the middle of history.
 * If a later CLOSED trade exists, an earlier Open cannot still be live (API capture leftovers).
 */
JBSync.dropSupersededOpenTrades = function dropSupersededOpenTrades(trades) {
  const list = Array.isArray(trades) ? trades : []
  if (list.length < 2) return list

  let maxClosedEntryMs = -Infinity
  let maxClosedTradeNumber = -Infinity

  for (const trade of list) {
    if (JBSync.isOpenTrade(trade)) continue
    const entryMs = JBSync.tradeEntryMs(trade)
    if (Number.isFinite(entryMs) && entryMs > maxClosedEntryMs) maxClosedEntryMs = entryMs
    if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber > maxClosedTradeNumber) {
      maxClosedTradeNumber = trade.tradeNumber
    }
  }

  if (!Number.isFinite(maxClosedEntryMs) && !Number.isFinite(maxClosedTradeNumber)) return list

  return list.filter((trade) => {
    if (!JBSync.isOpenTrade(trade)) return true

    const entryMs = JBSync.tradeEntryMs(trade)
    if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber >= maxClosedTradeNumber) return true
    if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber < maxClosedTradeNumber) return false

    if (Number.isFinite(entryMs) && Number.isFinite(maxClosedEntryMs) && entryMs < maxClosedEntryMs) {
      return false
    }

    return true
  })
}

JBSync.rowFingerprint = function rowFingerprint(row) {
  const symbol = String(row.instrument || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
  const entryMs = new Date(row.entry_date || "").getTime()
  const bucket = Number.isFinite(entryMs) ? Math.round(entryMs / 60_000) : 0
  const direction = String(row.trade_type || "").toLowerCase() === "buy" ? "long" : "short"
  return `${symbol}:${bucket}:${direction}`
}

JBSync.tradeFingerprint = function tradeFingerprint(trade) {
  const symbol = String(trade.instrument || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
  const entryMs = JBSync.tradeEntryMs(trade)
  const bucket = Number.isFinite(entryMs) ? Math.round(entryMs / 60_000) : 0
  return `${symbol}:${bucket}:${trade.direction || ""}`
}

JBSync.fetchKnownTradeSnapshot = async function fetchKnownTradeSnapshot(config, options = {}) {
  // Polls don't need the entire history — newest slice is enough for open/exit checks.
  const limit = options.limit || 1500
  const params = new URLSearchParams({ limit: String(limit) })

  const response = await fetch(`${config.apiUrl}/api/sync/trades?${params}`, {
    headers: {
      "X-Sync-Key": config.syncToken,
      Authorization: `Bearer ${config.syncToken}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Failed to load existing trades")

  const ids = new Set()
  const openIds = new Set()
  const fps = new Set()
  const openFps = new Set()
  for (const trade of data.trades || []) {
    if (trade.external_id) {
      ids.add(trade.external_id)
      if (trade.is_open) openIds.add(trade.external_id)
    }
    const fp = JBSync.rowFingerprint(trade)
    if (fp) {
      fps.add(fp)
      if (trade.is_open) openFps.add(fp)
    }
  }
  return { ids, openIds, fps, openFps }
}

JBSync.tradeNeedsRefresh = function tradeNeedsRefresh(trade, snapshot) {
  const extId = JBSync.buildExternalId(trade)
  const legacyId = `tv:${JBSync.strategySlug(trade.strategy || "")}:${trade.tradeNumber}`
  const fp = JBSync.tradeFingerprint(trade)
  const known =
    snapshot.ids.has(extId) ||
    snapshot.ids.has(legacyId) ||
    Boolean(snapshot.fps?.has(fp)) ||
    Boolean(snapshot.openFps?.has(fp))
  const wasOpenOnServer =
    snapshot.openIds.has(extId) ||
    snapshot.openIds.has(legacyId) ||
    Boolean(snapshot.openFps?.has(fp))
  const openOnTv = JBSync.isOpenTrade(trade)

  if (openOnTv) return !wasOpenOnServer
  if (!known) return true
  // Real close: this TV row exited a position the journal still has open.
  if (wasOpenOnServer) return true
  // Fingerprint/minute-bucket can drift after a bad scrape — still send the
  // close if journal has any live Open on this symbol + side.
  const symbol = String(trade.instrument || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
  const direction = trade.direction || ""
  if (symbol && direction && snapshot.openFps instanceof Set) {
    for (const openFp of snapshot.openFps) {
      if (openFp.startsWith(`${symbol}:`) && openFp.endsWith(`:${direction}`)) return true
    }
  }
  return false
}

/** @deprecated Use fetchKnownTradeSnapshot */
JBSync.fetchKnownExternalIds = async function fetchKnownExternalIds(config, instrument) {
  const snapshot = await JBSync.fetchKnownTradeSnapshot(config, instrument)
  return snapshot.ids
}

JBSync.isTradingViewUrl = function isTradingViewUrl(url) {
  return typeof url === "string" && url.includes("tradingview.com")
}

JBSync.isTradingViewChartTab = function isTradingViewChartTab(tab) {
  return Boolean(tab?.id && JBSync.isTradingViewUrl(tab.url) && tab.url.includes("/chart"))
}

JBSync.rememberTvChartTab = async function rememberTvChartTab(tabId) {
  if (!tabId || typeof chrome?.storage?.session?.set !== "function") return
  try {
    const tab = await chrome.tabs.get(tabId)
    if (!JBSync.isTradingViewChartTab(tab)) return
    await chrome.storage.session.set({ lastTvChartTabId: tabId })
  } catch {
    // tab closed or not accessible
  }
}

JBSync.getTradingViewTab = async function getTradingViewTab() {
  try {
    const stored = await chrome.storage.session.get("lastTvChartTabId")
    if (stored.lastTvChartTabId) {
      const tab = await chrome.tabs.get(stored.lastTvChartTabId)
      if (JBSync.isTradingViewChartTab(tab)) return tab
    }
  } catch {
    // stale tab id
  }

  for (const query of [
    { active: true, currentWindow: true },
    { active: true, lastFocusedWindow: true },
  ]) {
    const [activeTab] = await chrome.tabs.query(query)
    if (JBSync.isTradingViewChartTab(activeTab)) {
      await JBSync.rememberTvChartTab(activeTab.id)
      return activeTab
    }
  }

  const allTvTabs = await chrome.tabs.query({
    url: ["*://*.tradingview.com/*", "*://tradingview.com/*"],
  })
  const chartTabs = allTvTabs.filter((tab) => tab.url?.includes("/chart"))
  chartTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))
  const picked = chartTabs[0] || allTvTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null
  if (picked?.id) await JBSync.rememberTvChartTab(picked.id)
  return picked
}

JBSync.normalizeChartSymbol = function normalizeChartSymbol(raw) {
  if (typeof JBSymbol !== "undefined" && JBSymbol.normalize) {
    return JBSymbol.normalize(raw)
  }
  if (!raw) return ""
  let decoded = String(raw).trim()
  try {
    decoded = decodeURIComponent(decoded)
  } catch {
    // ignore
  }
  decoded = decoded.replace(/%3A/gi, ":")
  if (decoded.includes(":")) decoded = decoded.split(":").pop().trim()
  let normalized = decoded.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const suffix = normalized.match(/(XAUUSD|XAGUSD|BTCUSDT|BTCUSD|ETHUSDT|USOIL)$/i)
  if (suffix && normalized.length > suffix[1].length + 2) return suffix[1]
  const encodedColon = normalized.match(/3A([A-Z0-9]{3,12})$/i)
  if (encodedColon) return encodedColon[1]
  return normalized
}

JBSync.symbolFromTabUrl = function symbolFromTabUrl(url) {
  if (!url) return ""
  const match = url.match(/symbol=([^&]+)/i)
  if (!match) return ""
  return JBSync.normalizeChartSymbol(match[1])
}

JBSync.readChartSymbolFromTab = async function readChartSymbolFromTab(tab) {
  if (!tab?.id) return ""

  let fromPage = ""
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      world: "MAIN",
      files: ["src/lib/symbol-utils.js"],
    })
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      world: "MAIN",
      func: async () => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          try {
            const chart = window.tvWidget?.activeChart?.()
            const sym = chart?.symbol?.() || chart?.symbolExt?.()
            if (sym && typeof JBSymbol !== "undefined") {
              const normalized = JBSymbol.normalize(sym)
              if (normalized) return normalized
            }
          } catch {
            // ignore
          }

          const toolbarSelectors = [
            '[data-name="legend-source-title"]',
            '[data-name="header-toolbar-symbol-search"]',
            '[data-symbol]',
            '[class*="symbolTitle"]',
            '[class*="symbol-title"]',
            "#header-toolbar-symbol-search",
          ]
          for (const selector of toolbarSelectors) {
            const el = document.querySelector(selector)
            if (!el) continue
            const attr = el.getAttribute?.("data-symbol")
            if (attr?.trim() && typeof JBSymbol !== "undefined") {
              const normalized = JBSymbol.normalize(attr)
              if (normalized) return normalized
            }
            const text = el.textContent?.trim()
            if (text && text.length <= 32 && typeof JBSymbol !== "undefined") {
              const normalized = JBSymbol.normalize(text)
              if (normalized) return normalized
            }
          }

          if (typeof JBSymbol !== "undefined") {
            const fromTitle = JBSymbol.fromTitle(document.title)
            if (fromTitle) return fromTitle
          }

          await new Promise((resolve) => setTimeout(resolve, 150))
        }

        const symbolParam = location.href.match(/symbol=([^&]+)/i)
        if (symbolParam && typeof JBSymbol !== "undefined") {
          return JBSymbol.normalize(decodeURIComponent(symbolParam[1]))
        }
        return typeof JBSymbol !== "undefined" ? JBSymbol.fromTitle(document.title) : ""
      },
    })
    fromPage = JBSync.normalizeChartSymbol(injection?.result || "")
  } catch {
    fromPage = ""
  }

  if (fromPage) return fromPage
  return JBSync.symbolFromTabUrl(tab.url)
}

/** Reject BTC leftovers stamped onto GOLD, etc. */
JBSync.priceMatchesInstrument = function priceMatchesInstrument(price, symbol) {
  if (!Number.isFinite(price) || price <= 0) return false
  const s = String(symbol || "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()

  if (/^(XAU|GOLD)/.test(s)) return price >= 500 && price <= 15000
  if (/^(XAG|SILVER)/.test(s)) return price >= 5 && price <= 200
  if (/BTC/.test(s)) return price >= 5000 && price <= 500000
  if (/ETH/.test(s)) return price >= 50 && price <= 50000
  if (/SOL/.test(s)) return price >= 1 && price <= 5000
  if (/^(USOIL|UKOIL|WTI|CRUDE|OIL|CL)/.test(s)) return price >= 10 && price <= 500
  // Forex / unknown — only block absurd crypto-scale prices
  if (price >= 20000) return false
  return true
}

JBSync.filterTradesForChart = function filterTradesForChart(trades, chartSymbol) {
  const symbol = JBSync.normalizeChartSymbol(chartSymbol)
  if (!symbol) return []

  return (trades || []).filter((trade) => {
    const tradeInst = JBSync.normalizeChartSymbol(trade.instrument)
    if (tradeInst && tradeInst !== "UNKNOWN" && tradeInst !== symbol) return false
    return JBSync.priceMatchesInstrument(trade.entry?.price, symbol)
  })
}

JBSync.applyChartSymbol = function applyChartSymbol(trades, chartSymbol) {
  const normalized = JBSync.normalizeChartSymbol(chartSymbol)
  if (!normalized) return trades
  const filtered = JBSync.filterTradesForChart(trades, normalized)
  for (const trade of filtered) {
    trade.instrument = normalized
  }
  return filtered
}

/**
 * @param {boolean} importAll - true = full history scan (Import All button)
 * @param {{ mode?: 'light'|'full' }} [options]
 *   light (default for polls): top rows + capture memory, single frame, no full table walk
 *   full: deep extract + all frames + full virtualized scroll
 */
JBSync.scrapeFromActiveTab = async function scrapeFromActiveTab(importAll = false, options = {}) {
  const tab = await JBSync.getTradingViewTab()
  if (!tab?.id) {
    return {
      trades: [],
      error: "TradingView chart tab not found. Keep tradingview.com/chart open.",
    }
  }

  const chartSymbol = JBSync.normalizeChartSymbol(await JBSync.readChartSymbolFromTab(tab))

  if (!chartSymbol) {
    return {
      trades: [],
      error:
        "Could not detect chart symbol. Open your TradingView chart tab and make sure the symbol shows in the header.",
      debug: { tabUrl: tab.url },
    }
  }

  const scrapeMode = importAll || options.mode === "full" ? "full" : "light"
  // Polls only need the chart frame — scanning every iframe is expensive.
  const allFrames = scrapeMode === "full"
  const target = { tabId: tab.id, allFrames }

  if (scrapeMode === "full") {
    await JBSync.markImportAllLock(true)
  } else if (await JBSync.isImportAllLockActive()) {
    return { trades: [], skippedDueToImportAll: true, instrument: chartSymbol }
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id, allFrames: false },
    world: "MAIN",
    func: (sym) => {
      const prev = String(window.__JB_CAPTURED_CHART_SYMBOL__ || window.__JB_CHART_SYMBOL__ || "")
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase()
      window.__JB_CHART_SYMBOL__ = sym
      if (prev && prev !== sym) {
        window.__JB_CAPTURED_TRADES__ = []
      }
      window.__JB_CAPTURED_CHART_SYMBOL__ = sym
    },
    args: [chartSymbol],
  }).catch(() => {})

  await chrome.scripting.executeScript({
    target,
    func: (sym, importAllFlag, mode) => {
      window.__JB_CHART_SYMBOL__ = sym
      window.__JB_IMPORT_ALL__ = importAllFlag
      window.__JB_SCRAPE_MODE__ = mode
    },
    args: [chartSymbol, scrapeMode === "full", scrapeMode],
  }).catch(() => {})

  const merged = new Map()
  const mainWorldKeys = new Set()
  const gridKeys = new Set()
  const frameDebug = []

  try {
    // MAIN world: light = captured array only; full = deep extract walk.
    try {
      if (scrapeMode === "light") {
        const captured = await JBSync.readCapturedTradesFromTab(tab)
        for (const trade of captured.trades || []) {
          const key = JBSync.tradeKey(trade)
          mainWorldKeys.add(key)
          merged.set(key, JBSync.preferMergedTrade(merged.get(key), trade))
        }
        frameDebug.push({
          method: "captured-memory",
          trades: captured.trades?.length || 0,
        })
      } else {
        const mainExtractions = await chrome.scripting.executeScript({
          target,
          world: "MAIN",
          files: ["src/content/extract-trades.js"],
        })
        for (const ext of mainExtractions || []) {
          frameDebug.push({
            frameId: ext.frameId,
            method: "main-world",
            trades: ext.result?.trades?.length || 0,
            debug: ext.result?.debug,
            error: ext.error,
          })
          for (const trade of ext.result?.trades || []) {
            const key = JBSync.tradeKey(trade)
            mainWorldKeys.add(key)
            merged.set(key, JBSync.preferMergedTrade(merged.get(key), trade))
          }
        }
      }
    } catch (error) {
      frameDebug.push({ method: "main-world", injectionError: error.message })
    }

    // isolated-world scraper — light mode only peeks top of List of trades.
    const injections = await chrome.scripting.executeScript({
      target,
      files: ["src/content/main-scraper.js"],
    })

    for (const injection of injections || []) {
      if (injection.error) {
        frameDebug.push({ frameId: injection.frameId, method: "grid", injectionError: injection.error })
        continue
      }
      const frameResult = injection?.result
      if (!frameResult) {
        frameDebug.push({ frameId: injection.frameId, method: "grid", injectionError: "no result" })
        continue
      }
      frameDebug.push({
        frameId: injection.frameId,
        method: "grid",
        url: frameResult.frameUrl,
        trades: frameResult.trades?.length || 0,
        debug: frameResult.debug,
        error: frameResult.error,
      })
      for (const trade of frameResult.trades || []) {
        const key = JBSync.tradeKey(trade)
        gridKeys.add(key)
        merged.set(key, JBSync.preferMergedTrade(merged.get(key), trade))
      }
    }

    let mergedTrades = [...merged.values()]

    // Ghost opens often live only in API capture memory, not in List of Trades.
    // Keep capture-only opens that are NEWER than the grid (brand-new fills),
    // otherwise they never reach the journal/alarm.
    let maxGridTradeNumber = -Infinity
    for (const trade of mergedTrades) {
      const key = JBSync.tradeKey(trade)
      if (!gridKeys.has(key)) continue
      if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber > maxGridTradeNumber) {
        maxGridTradeNumber = trade.tradeNumber
      }
    }

    if (gridKeys.size > 0) {
      const before = mergedTrades.length
      mergedTrades = mergedTrades.filter((trade) => {
        if (!JBSync.isOpenTrade(trade)) return true
        const key = JBSync.tradeKey(trade)
        if (gridKeys.has(key)) return true
        if (mainWorldKeys.has(key) && !gridKeys.has(key)) {
          // Newer than anything in the Strategy Tester grid → real new fill.
          if (
            Number.isFinite(trade.tradeNumber) &&
            Number.isFinite(maxGridTradeNumber) &&
            trade.tradeNumber > maxGridTradeNumber
          ) {
            return true
          }
          // Grid empty of trade numbers (parse quirk) — still keep capture opens.
          if (!Number.isFinite(maxGridTradeNumber) || maxGridTradeNumber < 0) return true
          return false
        }
        return true
      })
      frameDebug.push({
        method: "filter-main-only-opens",
        removed: before - mergedTrades.length,
        gridKeys: gridKeys.size,
        maxGridTradeNumber: Number.isFinite(maxGridTradeNumber) ? maxGridTradeNumber : null,
      })
    }

    const beforeSuperseded = mergedTrades.length
    mergedTrades = JBSync.dropSupersededOpenTrades(mergedTrades)

    // If grid scrape was empty/stale but API capture has opens, sync those.
    if (!mergedTrades.length && mainWorldKeys.size > 0) {
      const captureFallback = [...merged.values()].filter((trade) => JBSync.isOpenTrade(trade))
      if (captureFallback.length) {
        mergedTrades = JBSync.dropSupersededOpenTrades(captureFallback)
        frameDebug.push({
          method: "capture-open-fallback",
          trades: mergedTrades.length,
        })
      }
    }

    const trades = JBSync.markLatestPaintedOpens(
      JBSync.applyChartSymbol(
        mergedTrades.sort((a, b) => b.tradeNumber - a.tradeNumber),
        chartSymbol,
      ),
    )
    const best = frameDebug.sort((a, b) => b.trades - a.trades)[0]
    const bestGrid = injections?.find((i) => i.result)?.result

    // Full import only — prune capture memory. Skip on every poll (too expensive).
    if (scrapeMode === "full") {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: false },
          world: "MAIN",
          func: () => {
            const list = window.__JB_CAPTURED_TRADES__
            if (!Array.isArray(list) || list.length < 2) return

            function isOpen(trade) {
              if (!trade?.exit) return true
              const exitSig = String(trade.exit.signal || "")
                .trim()
                .toLowerCase()
              const entrySig = String(trade.entry?.signal || "")
                .trim()
                .toLowerCase()
              return exitSig === "open" || entrySig === "open"
            }

            let maxClosedEntryMs = -Infinity
            let maxClosedTradeNumber = -Infinity
            for (const trade of list) {
              if (isOpen(trade)) continue
              const entryMs = new Date(String(trade.entry?.datetime || "").replace(/,\s*/, " ")).getTime()
              if (Number.isFinite(entryMs) && entryMs > maxClosedEntryMs) maxClosedEntryMs = entryMs
              if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber > maxClosedTradeNumber) {
                maxClosedTradeNumber = trade.tradeNumber
              }
            }

            window.__JB_CAPTURED_TRADES__ = list.filter((trade) => {
              if (!isOpen(trade)) return true
              const entryMs = new Date(String(trade.entry?.datetime || "").replace(/,\s*/, " ")).getTime()
              if (Number.isFinite(entryMs) && entryMs < maxClosedEntryMs) return false
              if (Number.isFinite(trade.tradeNumber) && trade.tradeNumber < maxClosedTradeNumber) return false
              return true
            })
          },
        })
      } catch {
        // ignore prune failures
      }
    }

    const result = {
      trades,
      strategy: bestGrid?.strategy || "TradingView Strategy",
      instrument: chartSymbol || bestGrid?.instrument || trades[0]?.instrument || "",
      debug: {
        chartSymbol: chartSymbol || null,
        tabId: tab.id,
        tabTitle: tab.title || null,
        tabUrl: tab.url || null,
        framesScanned: (injections?.length || 0) + frameDebug.filter((f) => f.method === "main-world").length,
        frameDebug,
        mergedTrades: trades.length,
        droppedSupersededOpens: beforeSuperseded - mergedTrades.length,
        ...(best?.debug || {}),
      },
    }

    if (!trades.length) {
      result.error = best?.error || bestGrid?.error || "No trades found. Open List of trades, scroll the table, retry."
    }

    return result
  } catch (error) {
    return {
      trades: [],
      error: `Scrape failed: ${error.message}. Reload extension + refresh TradingView (F5).`,
      debug: { frameDebug },
    }
  } finally {
    await chrome.scripting
      .executeScript({
        target: { tabId: tab.id, allFrames: true },
        func: () => {
          window.__JB_IMPORT_ALL__ = false
          window.__JB_SCRAPE_MODE__ = "light"
        },
      })
      .catch(() => {})
  }
}

JBSync.getConfig = async function getConfig() {
  const stored = await chrome.storage.sync.get([
    "apiUrl",
    "syncToken",
    "assetType",
    "pollIntervalSeconds",
    "autoSyncTrades",
  ])

  const pollIntervalSeconds =
    stored.pollIntervalSeconds === undefined ? 15 : Number(stored.pollIntervalSeconds)

  return {
    apiUrl: (stored.apiUrl || "http://localhost:3000").replace(/\/$/, ""),
    syncToken: (stored.syncToken || "").trim(),
    assetType: stored.assetType || "crypto",
    pollIntervalSeconds: Number.isFinite(pollIntervalSeconds) ? pollIntervalSeconds : 30,
    // Default ON when unset — capture sync always runs; this gates poll backup only.
    autoSyncTrades: stored.autoSyncTrades === undefined ? true : Boolean(stored.autoSyncTrades),
  }
}

JBSync.normalizeDatetime = function normalizeDatetime(value) {
  if (!value) return value
  return String(value).replace(/\s+/g, " ").trim()
}

JBSync.inferAssetType = function inferAssetType(symbol, fallback) {
  const normalized = (symbol || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  if (/^(XAU|XAG|GOLD|SILVER)/.test(normalized)) return "metal"
  if (/^(USOIL|UKOIL|WTI|CRUDE|CRUDEOIL|OIL|CL)/.test(normalized)) return "commodity"
  if (/^(EUR|GBP|USDJPY|USDCHF|AUDUSD|USDCAD|NZDUSD)/.test(normalized)) return "forex"
  return fallback || "crypto"
}

JBSync.normalizeTrades = function normalizeTrades(trades, assetType, chartSymbol) {
  const symbol = JBSync.normalizeChartSymbol(chartSymbol)
  if (!symbol) {
    throw new Error("Missing chart symbol — open the TradingView chart tab and retry.")
  }
  return trades.map((trade) => ({
    tradeNumber: trade.tradeNumber,
    direction: trade.direction,
    instrument: symbol,
    strategy: trade.strategy,
    assetType: JBSync.inferAssetType(symbol, assetType),
    entry: {
      datetime: JBSync.normalizeDatetime(trade.entry.datetime),
      price: trade.entry.price,
      signal: trade.entry.signal || "",
      size: trade.entry.size || 1,
    },
    exit: trade.exit
      ? {
          datetime: JBSync.normalizeDatetime(trade.exit.datetime),
          price: trade.exit.price,
          signal: trade.exit.signal || "",
        }
      : undefined,
    netPnl: trade.netPnl,
    returnPct: trade.returnPct,
    commission: trade.commission,
  }))
}

JBSync.postJson = async function postJson(url, token, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sync-Key": token,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`)
  return data
}

JBSync.formatByAccountMessage = function formatByAccountMessage(byAccount) {
  if (!byAccount || typeof byAccount !== "object") return ""
  const parts = Object.values(byAccount)
    .filter((entry) => entry && (entry.imported || entry.updated))
    .map((entry) => `${entry.name}: +${entry.imported || 0} new, ${entry.updated || 0} updated`)
  return parts.length ? ` → ${parts.join("; ")}` : ""
}

JBSync.ensureChartAccount = async function ensureChartAccount(config, chartSymbol) {
  if (!chartSymbol || !config.syncToken) return null
  const normalized = JBSync.normalizeChartSymbol(chartSymbol)
  if (!normalized) return null
  return JBSync.postJson(`${config.apiUrl}/api/sync/trades`, config.syncToken, {
    chartSymbol: normalized,
    trades: [],
  })
}

JBSync.buildReconcileOpensPayload = function buildReconcileOpensPayload(trades, chartSymbol) {
  const instrument = JBSync.normalizeChartSymbol(chartSymbol)
  if (!instrument) return null

  const opens = (trades || [])
    .filter((trade) => JBSync.isOpenTrade(trade))
    .map((trade) => ({
      externalId: JBSync.buildExternalId(trade),
      entryDatetime: trade.entry?.datetime || "",
      direction: trade.direction,
      tradeNumber: trade.tradeNumber,
    }))

  return { instrument, opens }
}

JBSync.reconcileOpenTrades = async function reconcileOpenTrades(config, trades, chartSymbol) {
  const reconcileOpens = JBSync.buildReconcileOpensPayload(trades, chartSymbol)
  if (!reconcileOpens || !config.syncToken) return { closedStale: 0 }
  // Empty open set is "scrape missed the live row", not "flat". Never wipe.
  if (!reconcileOpens.opens.length) return { closedStale: 0 }

  return JBSync.postJson(`${config.apiUrl}/api/sync/trades`, config.syncToken, {
    chartSymbol: reconcileOpens.instrument,
    trades: [],
    reconcileOpens,
  })
}

JBSync.syncTrades = async function syncTrades(trades, config, chartSymbol, options = {}) {
  const normalizedChart = JBSync.normalizeChartSymbol(chartSymbol)
  const reconcileFrom = options.reconcileFromTrades || trades

  if (!trades.length) {
    if (!normalizedChart) {
      return { imported: 0, updated: 0, skipped: 0, byAccount: {}, deduped: 0, accountsCreated: [] }
    }
    const result = await JBSync.ensureChartAccount(config, normalizedChart)
    const reconcile =
      options.reconcile !== false
        ? await JBSync.reconcileOpenTrades(config, reconcileFrom, normalizedChart)
        : { closedStale: 0 }
    return {
      imported: 0,
      updated: reconcile.updated || reconcile.closedStale || 0,
      skipped: 0,
      deduped: 0,
      closedStale: reconcile.closedStale || 0,
      byAccount: {},
      accountsCreated: result?.accountsCreated || [],
      message: result?.accountsCreated?.length
        ? `Account ready: ${result.accountsCreated.join(", ")}`
        : `Account checked: ${normalizedChart}`,
    }
  }

  const batchSize = 400
  let imported = 0
  let updated = 0
  let skipped = 0
  let deduped = 0
  let eventId = ""
  const byAccount = {}
  const accountsCreated = new Set()

  for (let i = 0; i < trades.length; i += batchSize) {
    const chunk = trades.slice(i, i + batchSize)
    const payload = {
      chartSymbol: normalizedChart || undefined,
      trades: JBSync.normalizeTrades(chunk, config.assetType, chartSymbol),
    }
    const result = await JBSync.postJson(`${config.apiUrl}/api/sync/trades`, config.syncToken, payload)
    imported += result.imported || 0
    updated += result.updated || 0
    skipped += result.skipped || 0
    deduped += result.deduped || 0
    if (result.eventId) eventId = result.eventId

    for (const name of result.accountsCreated || []) {
      accountsCreated.add(name)
    }

    for (const [accountId, stats] of Object.entries(result.byAccount || {})) {
      if (!byAccount[accountId]) {
        byAccount[accountId] = { ...stats }
      } else {
        byAccount[accountId].imported += stats.imported || 0
        byAccount[accountId].updated += stats.updated || 0
        byAccount[accountId].skipped += stats.skipped || 0
        if (stats.latestTrade) byAccount[accountId].latestTrade = stats.latestTrade
      }
    }
  }

  // Always reconcile against the FULL scrape open set (not just the synced subset).
  let closedStale = 0
  if (options.reconcile !== false) {
    const reconcile = await JBSync.reconcileOpenTrades(config, reconcileFrom, normalizedChart)
    closedStale = reconcile.closedStale || 0
    updated += closedStale
  }

  return {
    imported,
    updated,
    skipped,
    deduped,
    closedStale,
    eventId,
    byAccount,
    accountsCreated: [...accountsCreated],
  }
}

// "Extension connected" tolerates 5+ minutes of silence, so pinging more often
// than this only burns DB writes (and serverless invocations in production).
JBSync.HEARTBEAT_MIN_MS = 15_000

JBSync.sendHeartbeat = async function sendHeartbeat(config, options = {}) {
  if (!config.syncToken) return null

  const now = Date.now()
  if (!options.force && now - (JBSync._lastHeartbeatAt || 0) < JBSync.HEARTBEAT_MIN_MS) {
    return null
  }
  JBSync._lastHeartbeatAt = now

  try {
    return await JBSync.postJson(`${config.apiUrl}/api/sync/heartbeat`, config.syncToken, {
      pollIntervalSeconds: config.pollIntervalSeconds ?? 30,
      extensionId: chrome.runtime.id,
    })
  } catch (error) {
    // Failed ping shouldn't hold the throttle window open.
    JBSync._lastHeartbeatAt = 0
    throw error
  }
}

JBSync.checkRefreshRequest = async function checkRefreshRequest(config) {
  if (!config.syncToken) return { requested: false, reloadChart: false }

  const response = await fetch(`${config.apiUrl}/api/sync/refresh-status`, {
    cache: "no-store",
    headers: {
      "X-Sync-Key": config.syncToken,
      Authorization: `Bearer ${config.syncToken}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) return { requested: false, reloadChart: false }
  return {
    requested: Boolean(data.refreshRequested),
    reloadChart: Boolean(data.reloadChart),
  }
}

/** Same as pressing F5 on the TradingView chart tab. */
JBSync.reloadTradingViewChartTab = async function reloadTradingViewChartTab() {
  const tab = await JBSync.getTradingViewTab()
  if (!tab?.id) {
    throw new Error("TradingView chart tab not found. Keep tradingview.com/chart open.")
  }

  const tabId = tab.id

  await new Promise((resolve, reject) => {
    let sawLoading = false
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error("TradingView reload timed out"))
    }, 40_000)

    function onUpdated(id, info) {
      if (id !== tabId) return
      if (info.status === "loading") sawLoading = true
      if (info.status !== "complete" || !sawLoading) return
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(onUpdated)

    try {
      const reloaded = chrome.tabs.reload(tabId)
      if (reloaded && typeof reloaded.catch === "function") {
        reloaded.catch((error) => {
          clearTimeout(timeout)
          chrome.tabs.onUpdated.removeListener(onUpdated)
          reject(error)
        })
      }
    } catch (error) {
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(error)
    }
  })

  // Strategy Tester needs a moment after F5 to rebuild List of trades.
  await new Promise((resolve) => setTimeout(resolve, 4000))
  return tabId
}

JBSync.refreshNewTradesAfterTvReload = async function refreshNewTradesAfterTvReload(config) {
  if (JBSync._tvReloadPromise) return JBSync._tvReloadPromise

  JBSync._tvReloadPromise = (async () => {
    try {
      await JBSync.reloadTradingViewChartTab()
      return await JBSync.refreshNewTrades(config)
    } finally {
      JBSync._tvReloadPromise = null
    }
  })()

  return JBSync._tvReloadPromise
}

JBSync.completeRefreshRequest = async function completeRefreshRequest(config, result) {
  if (!config.syncToken) return
  await JBSync.postJson(`${config.apiUrl}/api/sync/refresh-status`, config.syncToken, {
    result: result || { ok: true },
  })
}

/** Match chrome.tabs.query pattern for the configured journal API origin. */
JBSync.journalOriginPattern = function journalOriginPattern(apiUrl) {
  try {
    const url = new URL((apiUrl || "http://localhost:3000").replace(/\/$/, ""))
    return `${url.origin}/*`
  } catch {
    return "http://localhost:3000/*"
  }
}

JBSync.normalizeLatestTrade = function normalizeLatestTrade(rawLatest, fallbackClosed) {
  if (!rawLatest) {
    return fallbackClosed ? { is_open: false } : undefined
  }
  const isOpen =
    rawLatest.is_open === true
      ? true
      : rawLatest.is_open === false
        ? false
        : String(rawLatest.signal || "")
            .trim()
            .toLowerCase() === "open"
  return {
    ...rawLatest,
    signal: rawLatest.signal || (isOpen ? "Open" : rawLatest.signal),
    is_open: isOpen,
  }
}

JBSync.notifyJournalTabs = async function notifyJournalTabs(payload, apiUrl) {
  try {
    const origin = JBSync.journalOriginPattern(apiUrl)
    const patterns = new Set([origin, "http://localhost/*", "http://127.0.0.1/*"])
    const tabs = await chrome.tabs.query({ url: [...patterns] })

    const detail = {
      type: "trades_updated",
      ...payload,
      at: payload?.at || new Date().toISOString(),
    }

    for (const tab of tabs) {
      if (!tab.id) continue

      // 1) Instant message to journal-bridge (fastest UI refresh path).
      try {
        await chrome.tabs.sendMessage(tab.id, { type: "TRADES_SYNCED", detail })
      } catch {
        // bridge may not be injected yet
      }

      // 2) Fallback DOM inject if bridge listener wasn't ready.
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (eventDetail) => {
            document.dispatchEvent(new CustomEvent("jb-trades-synced", { detail: eventDetail }))
          },
          args: [detail],
        })
      } catch {
        // tab may be loading or restricted
      }
    }
  } catch {
    // ignore
  }
}

JBSync.maybeRunRequestedRefresh = async function maybeRunRequestedRefresh(config) {
  if (!config.syncToken) return null
  // Leave the Live Sync queue pending until Import All finishes.
  if (await JBSync.isImportAllLockActive()) return null

  const request = await JBSync.checkRefreshRequest(config)
  if (!request.requested) return null

  const tab = await JBSync.getTradingViewTab()
  if (!tab?.id) {
    const failure = {
      ok: false,
      error: "TradingView chart tab not found. Keep tradingview.com/chart open.",
    }
    await JBSync.completeRefreshRequest(config, failure)
    return failure
  }

  try {
    const syncResult = request.reloadChart
      ? await JBSync.refreshNewTradesAfterTvReload(config)
      : await JBSync.refreshNewTrades(config)
    await JBSync.completeRefreshRequest(config, syncResult)
    return syncResult
  } catch (error) {
    const failure = { ok: false, error: error?.message || "Sync failed" }
    await JBSync.completeRefreshRequest(config, failure)
    return failure
  }
}

/** Sync trades already captured from TV network hooks — no Strategy Tester scrape needed. */
JBSync.syncCapturedTrades = async function syncCapturedTrades(config, trades, chartSymbol) {
  await JBSync.sendHeartbeat(config)

  const list = (trades || []).filter((trade) => trade?.entry?.price && trade?.entry?.datetime)
  if (!list.length) {
    return { imported: 0, updated: 0, skipped: 0, closedStale: 0, byAccount: {}, message: "No captured trades" }
  }

  let symbol =
    JBSync.normalizeChartSymbol(chartSymbol) ||
    JBSync.normalizeChartSymbol(list[0]?.instrument) ||
    ""

  if (!symbol || symbol === "UNKNOWN") {
    const tab = await JBSync.getTradingViewTab()
    symbol = JBSync.normalizeChartSymbol(await JBSync.readChartSymbolFromTab(tab))
  }

  if (!symbol) {
    throw new Error("Missing chart symbol for captured trades — refresh TradingView chart (F5).")
  }

  const stamped = list.map((trade) => ({ ...trade, instrument: symbol, strategy: trade.strategy || "TradingView Strategy" }))
  const snapshot = await JBSync.fetchKnownTradeSnapshot(config, { limit: 1500 })
  const newOrUpdated = stamped.filter((trade) => JBSync.tradeNeedsRefresh(trade, snapshot))

  if (!newOrUpdated.length) {
    return {
      imported: 0,
      updated: 0,
      skipped: stamped.length,
      closedStale: 0,
      byAccount: {},
      message: "Open trade already up to date",
    }
  }

  const syncResult = await JBSync.syncTrades(newOrUpdated, config, symbol, {
    reconcileFromTrades: stamped,
    reconcile: true,
  })

  const closedStale = syncResult.closedStale || 0
  if (syncResult.imported > 0) {
    const topAccount = Object.entries(syncResult.byAccount || {}).sort(
      (a, b) => (b[1].imported || 0) + (b[1].updated || 0) - ((a[1].imported || 0) + (a[1].updated || 0)),
    )[0]
    const latestTrade = JBSync.normalizeLatestTrade(topAccount?.[1]?.latestTrade)

    await JBSync.notifyJournalTabs(
      {
        eventId:
          syncResult.eventId ||
          `cap-${topAccount?.[0] || "acc"}-${latestTrade?.id || "none"}-${syncResult.imported}-${syncResult.updated}`,
        imported: syncResult.imported,
        updated: syncResult.updated,
        accountId: topAccount?.[0],
        accountName: topAccount?.[1]?.name,
        latestTrade,
      },
      config.apiUrl,
    )
  }

  if (syncResult.imported > 0) {
    syncResult.message = `${syncResult.imported} new trade(s) synced`
  } else if (syncResult.updated > 0) {
    syncResult.message = `${syncResult.updated} trade(s) updated`
  }

  return syncResult
}

JBSync.readCapturedTradesFromTab = async function readCapturedTradesFromTab(tab) {
  if (!tab?.id) return { trades: [], chartSymbol: "" }
  try {
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: false },
      world: "MAIN",
      func: () => {
        const symbol = String(window.__JB_CHART_SYMBOL__ || window.__JB_CAPTURED_CHART_SYMBOL__ || "")
          .replace(/[^A-Za-z0-9]/g, "")
          .toUpperCase()
        const trades = Array.isArray(window.__JB_CAPTURED_TRADES__)
          ? window.__JB_CAPTURED_TRADES__.map((t) => ({ ...t }))
          : []
        return { trades, chartSymbol: symbol }
      },
    })
    return {
      trades: injection?.result?.trades || [],
      chartSymbol: injection?.result?.chartSymbol || "",
    }
  } catch {
    return { trades: [], chartSymbol: "" }
  }
}

/** Scrape latest TV trades and sync only new / open ones — then drop stale Open rows. */
JBSync.refreshNewTrades = async function refreshNewTrades(config) {
  await JBSync.sendHeartbeat(config)

  const tab = await JBSync.getTradingViewTab()
  const captured = await JBSync.readCapturedTradesFromTab(tab)

  // Polls use light scrape (top ~40 rows + capture). Never full-table walk.
  let result = await JBSync.scrapeFromActiveTab(false, { mode: "light" }).catch((error) => ({
    trades: [],
    error: error?.message || "Scrape failed",
  }))

  if (result?.skippedDueToImportAll) {
    return {
      imported: 0,
      updated: 0,
      skipped: 0,
      closedStale: 0,
      byAccount: {},
      paused: true,
      message: "Paused while Import all runs",
    }
  }

  // If Strategy Tester grid is empty/stale, fall back to network-captured trades.
  // Do not re-insert capture-only leftovers — they make a ghost row look like the latest fill.
  if (!result?.trades?.length && captured.trades.length) {
    result = {
      trades: captured.trades,
      instrument: captured.chartSymbol || captured.trades[0]?.instrument || "",
      error: null,
      debug: { fallback: "captured-memory" },
    }
  }

  const snapshot = await JBSync.fetchKnownTradeSnapshot(config, { limit: 1500 })
  const chartSymbol =
    JBSync.normalizeChartSymbol(result?.instrument || captured.chartSymbol) ||
    JBSync.normalizeChartSymbol(await JBSync.readChartSymbolFromTab(tab))

  if (!result?.trades?.length) {
    // Scrape empty — still try to close journal opens using captured memory only.
    if (captured.trades.length && chartSymbol) {
      result = {
        trades: captured.trades,
        instrument: chartSymbol,
        error: null,
        debug: { fallback: "captured-memory-empty-scrape" },
      }
    } else {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        closedStale: 0,
        byAccount: {},
        message: "Waiting for List of trades",
        warning:
          result?.error ||
          "Strategy Tester → open bottom panel → click “List of trades”. New fills will sync automatically after that.",
      }
    }
  }

  if (result?.trades?.length) {
    result.trades = JBSync.markLatestPaintedOpens(result.trades)
  }

  const latestTradeNumber = Math.max(...result.trades.map((trade) => trade.tradeNumber))
  const newOrUpdated = result.trades.filter(
    (trade) =>
      trade.tradeNumber === latestTradeNumber ||
      JBSync.isOpenTrade(trade) ||
      JBSync.tradeNeedsRefresh(trade, snapshot),
  )

  const scrapedOpens = result.trades.filter((trade) => JBSync.isOpenTrade(trade))

  let syncResult = { imported: 0, updated: 0, skipped: 0, deduped: 0, closedStale: 0, byAccount: {} }

  if (newOrUpdated.length) {
    // Reconcile only when the scrape still sees a live Open. Empty open set
    // must not delete journal Opens (missed Type=Open / light scrape).
    syncResult = await JBSync.syncTrades(newOrUpdated, config, chartSymbol, {
      reconcileFromTrades: result.trades,
      reconcile: scrapedOpens.length > 0,
    })
  }

  const closedStale = syncResult.closedStale || 0
  const nonStaleUpdated = Math.max(0, (syncResult.updated || 0) - closedStale)

  if (syncResult.imported === 0 && nonStaleUpdated === 0 && !closedStale) {
    const latest = result.trades.find((trade) => trade.tradeNumber === latestTradeNumber)
    syncResult.message = JBSync.isOpenTrade(latest || {})
      ? "Open trade already up to date"
      : "No new trades"
  } else if (syncResult.imported > 0) {
    syncResult.message =
      closedStale > 0
        ? `${syncResult.imported} new trade(s) synced · cleared ${closedStale} stale open(s)`
        : `${syncResult.imported} new trade(s) synced`
  } else if (nonStaleUpdated > 0) {
    syncResult.message =
      closedStale > 0
        ? `${nonStaleUpdated} trade(s) updated · cleared ${closedStale} stale open(s)`
        : `${nonStaleUpdated} trade(s) updated`
  } else if (closedStale > 0) {
    syncResult.message = `Cleared ${closedStale} stale open trade(s)`
  }

  if (syncResult.imported > 0) {
    const topAccount = Object.entries(syncResult.byAccount || {}).sort(
      (a, b) => (b[1].imported || 0) + (b[1].updated || 0) - ((a[1].imported || 0) + (a[1].updated || 0)),
    )[0]

    const latestTrade = JBSync.normalizeLatestTrade(topAccount?.[1]?.latestTrade)

    await JBSync.notifyJournalTabs(
      {
        eventId:
          syncResult.eventId ||
          `ext-${topAccount?.[0] || "acc"}-${latestTrade?.id || "none"}-${syncResult.imported}-${syncResult.updated}`,
        imported: syncResult.imported,
        updated: syncResult.updated,
        accountId: topAccount?.[0],
        accountName: topAccount?.[1]?.name,
        latestTrade,
      },
      config.apiUrl,
    )
  }

  return { ...syncResult, result, synced: newOrUpdated.length }
}
