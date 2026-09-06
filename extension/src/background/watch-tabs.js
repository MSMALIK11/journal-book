/* global JBSync, JBSymbol, chrome */
/** Background TradingView tabs for journal watch_symbols — user does not open these manually. */
var JBWatch = globalThis.JBWatch || {}

JBWatch.STORAGE_KEY = "jbWatchTabIds"
JBWatch.SYMBOL_MAP_KEY = "jbWatchTabBySymbol"

JBWatch.readManagedTabIds = async function readManagedTabIds() {
  try {
    const stored = await chrome.storage.session.get(JBWatch.STORAGE_KEY)
    const ids = stored[JBWatch.STORAGE_KEY]
    return Array.isArray(ids) ? ids.map(Number).filter(Boolean) : []
  } catch {
    return []
  }
}

JBWatch.writeManagedTabIds = async function writeManagedTabIds(ids) {
  const unique = [...new Set(ids.map(Number).filter(Boolean))]
  try {
    await chrome.storage.session.set({ [JBWatch.STORAGE_KEY]: unique })
  } catch {
    await chrome.storage.local.set({ [JBWatch.STORAGE_KEY]: unique })
  }
}

JBWatch.readSymbolMap = async function readSymbolMap() {
  try {
    const stored = await chrome.storage.session.get(JBWatch.SYMBOL_MAP_KEY)
    const map = stored[JBWatch.SYMBOL_MAP_KEY]
    return map && typeof map === "object" ? map : {}
  } catch {
    return {}
  }
}

JBWatch.writeSymbolMap = async function writeSymbolMap(map) {
  try {
    await chrome.storage.session.set({ [JBWatch.SYMBOL_MAP_KEY]: map })
  } catch {
    await chrome.storage.local.set({ [JBWatch.SYMBOL_MAP_KEY]: map })
  }
}

JBWatch.markWatchTab = async function markWatchTab(tabId) {
  if (!tabId) return
  const ids = await JBWatch.readManagedTabIds()
  if (!ids.includes(tabId)) {
    ids.push(tabId)
    await JBWatch.writeManagedTabIds(ids)
  }
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        window.__JB_WATCH_TAB__ = true
      },
    })
  } catch {
    // ignore
  }
}

JBWatch.buildWatchChartUrl = function buildWatchChartUrl(layoutUrl, canonicalSymbol) {
  const tvSym =
    typeof JBSymbol !== "undefined" && JBSymbol.toTradingViewSymbol
      ? JBSymbol.toTradingViewSymbol(canonicalSymbol)
      : canonicalSymbol

  if (!layoutUrl) {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`
  }

  try {
    const url = new URL(layoutUrl)
    url.searchParams.set("symbol", tvSym)
    return url.toString()
  } catch {
    return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tvSym)}`
  }
}

JBWatch.findTabForSymbol = async function findTabForSymbol(symbol) {
  const normalized = JBSync.normalizeChartSymbol(symbol)
  if (!normalized) return null

  const tabs = await JBSync.getTradingViewChartTabs()
  for (const tab of tabs) {
    const fromUrl = JBSync.symbolFromTabUrl(tab.url)
    if (fromUrl && fromUrl === normalized) return tab
  }

  for (const tab of tabs) {
    const fromPage = JBSync.normalizeChartSymbol(await JBSync.readChartSymbolFromTab(tab))
    if (fromPage === normalized) return tab
  }

  return null
}

JBWatch.waitForTabLoad = function waitForTabLoad(tabId, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated)
      reject(new Error("Watch tab load timed out"))
    }, timeoutMs)

    function onUpdated(id, info) {
      if (id !== tabId || info.status !== "complete") return
      clearTimeout(timeout)
      chrome.tabs.onUpdated.removeListener(onUpdated)
      resolve()
    }

    chrome.tabs.onUpdated.addListener(onUpdated)
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timeout)
        chrome.tabs.onUpdated.removeListener(onUpdated)
        resolve()
      }
    }).catch(reject)
  })
}

/**
 * Ensure background chart tabs exist for each watch symbol.
 * Clones the user's active chart layout so the same strategy loads on each symbol.
 */
JBWatch.ensureWatchTabs = async function ensureWatchTabs(watchSymbols, layoutUrl, injectTvHooks) {
  const symbols = (watchSymbols || [])
    .map((s) => JBSync.normalizeChartSymbol(s))
    .filter(Boolean)
    .slice(0, 5)

  const previousMap = await JBWatch.readSymbolMap()
  const symbolMap = {}
  const usedTabIds = new Set()
  const managedIds = await JBWatch.readManagedTabIds()

  for (const symbol of symbols) {
    let tab = await JBWatch.findTabForSymbol(symbol)
    if (tab?.id) {
      symbolMap[symbol] = tab.id
      usedTabIds.add(tab.id)
      continue
    }

    const url = JBWatch.buildWatchChartUrl(layoutUrl, symbol)
    tab = await chrome.tabs.create({ url, active: false, pinned: true })
    if (!tab?.id) continue

    await JBWatch.markWatchTab(tab.id)
    try {
      await JBWatch.waitForTabLoad(tab.id)
    } catch {
      // tab may still become usable later
    }
    if (typeof injectTvHooks === "function") {
      await injectTvHooks(tab.id)
    }
    symbolMap[symbol] = tab.id
    usedTabIds.add(tab.id)
  }

  await JBWatch.writeSymbolMap(symbolMap)

  const removedTabIds = new Set()
  for (const [symbol, tabId] of Object.entries(previousMap)) {
    if (symbols.includes(symbol)) continue
    if (tabId) removedTabIds.add(Number(tabId))
  }

  for (const tabId of [...managedIds, ...removedTabIds]) {
    if (usedTabIds.has(tabId)) continue
    try {
      await chrome.tabs.get(tabId)
      const isWatch = await chrome.scripting
        .executeScript({
          target: { tabId },
          world: "MAIN",
          func: () => Boolean(window.__JB_WATCH_TAB__),
        })
        .then(([r]) => Boolean(r?.result))
        .catch(() => false)
      if (isWatch) {
        await chrome.tabs.remove(tabId).catch(() => {})
      }
    } catch {
      // tab already closed
    }
  }

  await JBWatch.writeManagedTabIds(
    Object.values(symbolMap)
      .map(Number)
      .filter(Boolean),
  )
  return symbolMap
}

globalThis.JBWatch = JBWatch
