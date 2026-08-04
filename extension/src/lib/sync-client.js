// Shared scrape helpers — loaded by popup (script tag) and background (importScripts).
var JBSync = (globalThis.JBSync = globalThis.JBSync || {})

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

JBSync.fetchKnownExternalIds = async function fetchKnownExternalIds(config, instrument) {
  const params = new URLSearchParams({ limit: "10000" })
  if (instrument) params.set("instrument", instrument)

  const response = await fetch(`${config.apiUrl}/api/sync/trades?${params}`, {
    headers: {
      "X-Sync-Key": config.syncToken,
      Authorization: `Bearer ${config.syncToken}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || "Failed to load existing trades")
  const ids = new Set()
  for (const trade of data.trades || []) {
    if (trade.external_id) ids.add(trade.external_id)
  }
  return ids
}

JBSync.isTradingViewUrl = function isTradingViewUrl(url) {
  return typeof url === "string" && url.includes("tradingview.com")
}

JBSync.getTradingViewTab = async function getTradingViewTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  if (activeTab?.id && JBSync.isTradingViewUrl(activeTab.url)) return activeTab

  const allTvTabs = await chrome.tabs.query({ url: ["*://*.tradingview.com/*", "*://tradingview.com/*"] })
  return allTvTabs.find((tab) => tab.url?.includes("/chart")) || allTvTabs[0] || null
}

JBSync.scrapeFromActiveTab = async function scrapeFromActiveTab(importAll = false) {
  const tab = await JBSync.getTradingViewTab()
  if (!tab?.id) {
    return {
      trades: [],
      error: "TradingView chart tab not found. Open tradingview.com/chart and refresh (F5).",
    }
  }

  const target = { tabId: tab.id, allFrames: true }
  const merged = new Map()
  const frameDebug = []

  try {
    // 1) MAIN world — API capture + in-memory report objects
    try {
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
        for (const trade of ext.result?.trades || []) merged.set(JBSync.tradeKey(trade), trade)
      }
    } catch (error) {
      frameDebug.push({ method: "main-world", injectionError: error.message })
    }

    // 2) Isolated world — grid geometry scrape + scroll
    await chrome.scripting.executeScript({
      target,
      func: (flag) => {
        window.__JB_IMPORT_ALL__ = flag
      },
      args: [importAll],
    })

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
      for (const trade of frameResult.trades || []) merged.set(JBSync.tradeKey(trade), trade)
    }

    const trades = [...merged.values()].sort((a, b) => b.tradeNumber - a.tradeNumber)
    const best = frameDebug.sort((a, b) => b.trades - a.trades)[0]
    const bestGrid = injections?.find((i) => i.result)?.result

    const result = {
      trades,
      strategy: bestGrid?.strategy || "TradingView Strategy",
      instrument: bestGrid?.instrument || "BTCUSDT",
      debug: {
        framesScanned: (injections?.length || 0) + frameDebug.filter((f) => f.method === "main-world").length,
        frameDebug,
        mergedTrades: trades.length,
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
    stored.pollIntervalSeconds === undefined ? 30 : Number(stored.pollIntervalSeconds)

  return {
    apiUrl: (stored.apiUrl || "http://localhost:3000").replace(/\/$/, ""),
    syncToken: (stored.syncToken || "").trim(),
    assetType: stored.assetType || "crypto",
    pollIntervalSeconds: Number.isFinite(pollIntervalSeconds) ? pollIntervalSeconds : 30,
    autoSyncTrades: Boolean(stored.autoSyncTrades),
  }
}

JBSync.normalizeDatetime = function normalizeDatetime(value) {
  if (!value) return value
  return String(value).replace(/\s+/g, " ").trim()
}

JBSync.normalizeTrades = function normalizeTrades(trades, assetType) {
  return trades.map((trade) => ({
    tradeNumber: trade.tradeNumber,
    direction: trade.direction,
    instrument: trade.instrument,
    strategy: trade.strategy,
    assetType,
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

JBSync.syncTrades = async function syncTrades(trades, config) {
  if (!trades.length) return { imported: 0, updated: 0, skipped: 0, byAccount: {}, deduped: 0 }

  const batchSize = 400
  let imported = 0
  let updated = 0
  let skipped = 0
  let deduped = 0
  const byAccount = {}

  for (let i = 0; i < trades.length; i += batchSize) {
    const chunk = trades.slice(i, i + batchSize)
    const result = await JBSync.postJson(`${config.apiUrl}/api/sync/trades`, config.syncToken, {
      trades: JBSync.normalizeTrades(chunk, config.assetType),
    })
    imported += result.imported || 0
    updated += result.updated || 0
    skipped += result.skipped || 0
    deduped += result.deduped || 0

    for (const [accountId, stats] of Object.entries(result.byAccount || {})) {
      if (!byAccount[accountId]) {
        byAccount[accountId] = { ...stats }
      } else {
        byAccount[accountId].imported += stats.imported || 0
        byAccount[accountId].updated += stats.updated || 0
        byAccount[accountId].skipped += stats.skipped || 0
      }
    }
  }

  return { imported, updated, skipped, deduped, byAccount }
}

JBSync.sendHeartbeat = async function sendHeartbeat(config) {
  if (!config.syncToken) return null
  return JBSync.postJson(`${config.apiUrl}/api/sync/heartbeat`, config.syncToken, {
    pollIntervalSeconds: config.pollIntervalSeconds ?? 30,
  })
}

JBSync.checkRefreshRequest = async function checkRefreshRequest(config) {
  if (!config.syncToken) return false

  const response = await fetch(`${config.apiUrl}/api/sync/refresh-status`, {
    cache: "no-store",
    headers: {
      "X-Sync-Key": config.syncToken,
      Authorization: `Bearer ${config.syncToken}`,
    },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) return false
  return Boolean(data.refreshRequested)
}

JBSync.completeRefreshRequest = async function completeRefreshRequest(config, result) {
  if (!config.syncToken) return
  await JBSync.postJson(`${config.apiUrl}/api/sync/refresh-status`, config.syncToken, {
    result: result || { ok: true },
  })
}

JBSync.maybeRunRequestedRefresh = async function maybeRunRequestedRefresh(config) {
  if (!config.syncToken) return null

  const requested = await JBSync.checkRefreshRequest(config)
  if (!requested) return null

  const tab = await JBSync.getTradingViewTab()
  if (!tab?.id) {
    const failure = {
      ok: false,
      error: "TradingView chart tab not found. Open tradingview.com/chart and refresh (F5).",
    }
    await JBSync.completeRefreshRequest(config, failure)
    return failure
  }

  try {
    const syncResult = await JBSync.refreshNewTrades(config)
    await JBSync.completeRefreshRequest(config, syncResult)
    return syncResult
  } catch (error) {
    const failure = { ok: false, error: error?.message || "Sync failed" }
    await JBSync.completeRefreshRequest(config, failure)
    return failure
  }
}

/** Scrape latest TV trades and sync only new / open ones — existing journal rows stay. */
JBSync.refreshNewTrades = async function refreshNewTrades(config) {
  await JBSync.sendHeartbeat(config)

  const result = await JBSync.scrapeFromActiveTab(false)
  if (!result?.trades?.length) {
    throw new Error(result?.error || "No trades found on TradingView")
  }

  const knownIds = await JBSync.fetchKnownExternalIds(config, result.instrument)
  const newOrUpdated = result.trades.filter((trade) => {
    if (!JBSync.tradeKnownOnServer(trade, knownIds)) return true
    if (trade.entry && !trade.exit) return true
    return false
  })

  let syncResult = { imported: 0, updated: 0, skipped: 0, deduped: 0, byAccount: {} }

  if (newOrUpdated.length) {
    syncResult = await JBSync.syncTrades(newOrUpdated, config)
  } else {
    syncResult.message = "No new trades"
  }

  return { ...syncResult, result, synced: newOrUpdated.length }
}
