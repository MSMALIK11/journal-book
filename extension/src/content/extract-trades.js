// MAIN world — extract trades from captured API data or in-page JS state.
(function () {
  function parseNumber(value) {
    if (value == null) return undefined
    const cleaned = String(value).replace(/[^\d.,+\-]/g, "").replace(/,/g, "")
    const num = Number.parseFloat(cleaned)
    return Number.isFinite(num) ? num : undefined
  }

  function normalizeTrade(item, instrument, strategy) {
    const tradeNumber = Number(item.tradeNumber ?? item.number ?? item.index ?? item.id)
    if (!Number.isFinite(tradeNumber)) return null

    const direction = String(item.direction ?? item.side ?? item.type ?? "long").toLowerCase().includes("short")
      ? "short"
      : "long"

    const entry = item.entry || item.entryOrder || item
    const exit = item.exit || item.exitOrder

    const trade = {
      tradeNumber,
      direction,
      instrument: instrument || item.symbol || item.instrument,
      strategy: item.strategy || strategy,
      entry: null,
      exit: null,
    }

    const entryPrice = parseNumber(entry?.price ?? entry?.entryPrice ?? item.entryPrice)
    const entryTime = entry?.datetime || entry?.time || entry?.date || item.entryTime || item.entryDate || ""
    if (entryPrice != null && entryTime) {
      trade.entry = {
        datetime: String(entryTime),
        price: entryPrice,
        signal: entry?.signal || item.entrySignal || "",
        size: parseNumber(entry?.size ?? entry?.qty ?? item.qty) || 1,
      }
    }

    const exitPrice = parseNumber(exit?.price ?? exit?.exitPrice ?? item.exitPrice)
    const exitTime = exit?.datetime || exit?.time || exit?.date || item.exitTime || item.exitDate || ""
    if (exitPrice != null && exitTime) {
      trade.exit = {
        datetime: String(exitTime),
        price: exitPrice,
        signal: exit?.signal || item.exitSignal || "",
      }
      trade.netPnl = parseNumber(item.netPnl ?? item.profit ?? item.pnl)
      trade.returnPct = parseNumber(item.returnPct ?? item.return)
      trade.commission = parseNumber(item.commission)
    }

    return trade.entry ? trade : null
  }

  function deepFindTradeLists(node, depth, seen, out) {
    if (!node || depth > 12 || typeof node !== "object") return
    if (seen.has(node)) return
    seen.add(node)

    if (Array.isArray(node)) {
      if (
        node.length > 0 &&
        node.some(
          (item) =>
            item &&
            typeof item === "object" &&
            (item.tradeNumber != null ||
              item.number != null ||
              item.entryPrice != null ||
              item.entry ||
              item.exit),
        )
      ) {
        out.push(node)
      }
      for (const item of node) deepFindTradeLists(item, depth + 1, seen, out)
      return
    }

    for (const key of Object.keys(node)) {
      if (/trade|order|report|backtest|filled|position|execution|strategy/i.test(key)) {
        deepFindTradeLists(node[key], depth + 1, seen, out)
      }
    }
  }

  function extractFromMemory(instrument, strategy) {
    const lists = []
    const seen = new WeakSet()

    try {
      deepFindTradeLists(window.__JB_CAPTURED_TRADES__, 0, seen, lists)
    } catch {
      // ignore
    }

    const keys = Object.keys(window).filter((k) => /widget|chart|tv|trading|backtest|strategy/i.test(k))
    for (const key of keys.slice(0, 40)) {
      try {
        deepFindTradeLists(window[key], 0, seen, lists)
      } catch {
        // ignore
      }
    }

    try {
      if (window.tvWidget?.activeChart) {
        deepFindTradeLists(window.tvWidget.activeChart(), 0, seen, lists)
      }
    } catch {
      // ignore
    }

    const trades = new Map()
    for (const list of lists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const trade = normalizeTrade(item, instrument, strategy)
        if (trade) trades.set(trade.tradeNumber, trade)
      }
    }

    return [...trades.values()]
  }

  function getInstrument() {
    if (window.__JB_CHART_SYMBOL__) {
      return String(window.__JB_CHART_SYMBOL__).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }
    const url = location.href
    const symbolParam = url.match(/symbol=([^&]+)/i)
    if (symbolParam) {
      const decoded = decodeURIComponent(symbolParam[1])
      const pair = decoded.split(":").pop() || decoded
      return pair.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }
    const fromTitle = (document.title || "").split(",")[0]?.trim()
    if (/gold/i.test(fromTitle || "")) return "XAUUSD"
    if (/silver/i.test(fromTitle || "")) return "XAGUSD"
    if (/oil|crude|wti/i.test(fromTitle || "")) return "USOIL"
    if (fromTitle) return fromTitle.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    return "UNKNOWN"
  }

  function sameInstrument(a, b) {
    const left = String(a || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
    const right = String(b || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
    if (!left || !right || left === "UNKNOWN" || right === "UNKNOWN") return true
    return left === right
  }

  const instrument = getInstrument()
  const captured = (window.__JB_CAPTURED_TRADES__ || []).filter((t) => sameInstrument(t.instrument, instrument))
  const fromMemory = extractFromMemory(instrument, "TradingView Strategy").filter((t) =>
    sameInstrument(t.instrument, instrument),
  )
  const merged = new Map()

  for (const t of [...captured, ...fromMemory]) {
    const trade = normalizeTrade(t, instrument, "TradingView Strategy")
    if (trade) merged.set(trade.tradeNumber, trade)
  }

  return {
    trades: [...merged.values()],
    debug: {
      capturedCount: captured.length,
      memoryCount: fromMemory.length,
      method: "main-world",
      instrument,
    },
  }
})()
