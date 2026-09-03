// Runs in MAIN world at document_start — captures TradingView backtest API responses.
(function () {
  if (window.__JB_HOOKED__) return
  window.__JB_HOOKED__ = true
  window.__JB_CAPTURED_TRADES__ = window.__JB_CAPTURED_TRADES__ || []

  function parseNumber(value) {
    if (value == null) return undefined
    const cleaned = String(value).replace(/[^\d.,+\-]/g, "").replace(/,/g, "")
    const num = Number.parseFloat(cleaned)
    return Number.isFinite(num) ? num : undefined
  }

  function normalizeCapturedTrades(payload) {
    const lists = []

    function collectLists(node, depth = 0, seen = new WeakSet()) {
      if (!node || depth > 10 || typeof node !== "object") return
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
                item.exit ||
                (item.type && /entry|exit|long|short/i.test(String(item.type)))),
          )
        ) {
          lists.push(node)
        }
        for (const item of node) collectLists(item, depth + 1, seen)
        return
      }

      for (const key of Object.keys(node)) {
        if (/trade|order|report|backtest|filled|position|execution/i.test(key)) {
          collectLists(node[key], depth + 1, seen)
        }
      }
    }

    collectLists(payload)

    const direct =
      payload?.trades ||
      payload?.report?.trades ||
      payload?.data?.trades ||
      payload?.filledOrders ||
      payload?.orders ||
      (Array.isArray(payload) ? payload : null)

    if (Array.isArray(direct) && direct.length) lists.unshift(direct)

    const trades = new Map()

    for (const list of lists) {
      if (!Array.isArray(list)) continue
      for (const item of list) {
        const tradeNumber = Number(item.tradeNumber ?? item.number ?? item.index ?? item.id)
        if (!Number.isFinite(tradeNumber)) continue

        const direction = String(item.direction ?? item.side ?? item.type ?? "long").toLowerCase().includes("short")
          ? "short"
          : "long"

        const entry = item.entry || item.entryOrder || item
        const exit = item.exit || item.exitOrder

        const existing = trades.get(tradeNumber) || {
          tradeNumber,
          direction,
          instrument: window.__JB_CHART_SYMBOL__ || item.symbol || item.instrument || "UNKNOWN",
          strategy: item.strategy || "TradingView Strategy",
          entry: null,
          exit: null,
        }

        const entryPrice = parseNumber(entry?.price ?? entry?.entryPrice ?? item.entryPrice)
        const entryTime = entry?.datetime || entry?.time || entry?.date || item.entryTime || item.entryDate || ""
        if (entryPrice != null && entryTime) {
          existing.entry = {
            datetime: String(entryTime),
            price: entryPrice,
            signal: entry?.signal || item.entrySignal || "",
            size: parseNumber(entry?.size ?? entry?.qty ?? item.qty) || 1,
          }
        }

        const exitPrice = parseNumber(exit?.price ?? exit?.exitPrice ?? item.exitPrice)
        const exitTime = exit?.datetime || exit?.time || exit?.date || item.exitTime || item.exitDate || ""
        if (exitPrice != null && exitTime) {
          existing.exit = {
            datetime: String(exitTime),
            price: exitPrice,
            signal: exit?.signal || item.exitSignal || "",
          }
          existing.netPnl = parseNumber(item.netPnl ?? item.profit ?? item.pnl)
          existing.returnPct = parseNumber(item.returnPct ?? item.return)
          existing.commission = parseNumber(item.commission)
        }

        if (existing.entry?.price) trades.set(tradeNumber, existing)
      }
    }

    return [...trades.values()]
  }

  function tradeFingerprint(trade) {
    const entry = trade.entry || {}
    const exit = trade.exit || {}
    return [
      trade.tradeNumber,
      entry.datetime || "",
      entry.price ?? "",
      entry.signal || "",
      exit.datetime || "",
      exit.price ?? "",
      exit.signal || "",
      trade.netPnl ?? "",
    ].join("|")
  }

  function isOpenCapturedTrade(trade) {
    if (!trade?.exit) return true
    const exitDt = String(trade.exit.datetime || "").trim()
    if (/^open$/i.test(exitDt)) return true
    const leftoverOpen =
      /^open$/i.test(String(trade.exit.signal || "").trim()) ||
      /^open$/i.test(String(trade.entry?.signal || "").trim())
    const exitSig = String(trade.exit.signal || "").trim()
    const confirmedTpSl = /\b(tp\/sl|take\s*profit|stop\s*loss|\btp\b|\bsl\b|stop|target)\b/i.test(exitSig) && !/^open$/i.test(exitSig)
    if (leftoverOpen && !confirmedTpSl) return true
    const entryMs = new Date(trade.entry?.datetime || "").getTime()
    const exitMs = new Date(trade.exit.datetime || "").getTime()
    const entryPrice = Number(trade.entry?.price)
    const exitPrice = Number(trade.exit.price)
    const paintedMtm =
      Number.isFinite(entryMs) &&
      Number.isFinite(exitMs) &&
      entryPrice > 0 &&
      Number.isFinite(exitPrice) &&
      Math.abs(exitMs - entryMs) <= 90_000 &&
      Math.abs(exitPrice - entryPrice) / entryPrice <= 0.0002
    return !confirmedTpSl && paintedMtm
  }

  function mergeTradeRecord(before, incoming) {
    const entry =
      incoming.entry?.price && incoming.entry?.datetime ? incoming.entry : before?.entry || incoming.entry
    const exit =
      incoming.exit && (incoming.exit.price != null || incoming.exit.signal)
        ? { ...(before?.exit || {}), ...incoming.exit }
        : before?.exit || incoming.exit

    return {
      tradeNumber: incoming.tradeNumber ?? before?.tradeNumber,
      direction: incoming.direction ?? before?.direction ?? "long",
      instrument: incoming.instrument || before?.instrument || "UNKNOWN",
      strategy: incoming.strategy || before?.strategy || "TradingView Strategy",
      entry: entry || null,
      exit: exit || null,
      netPnl: incoming.netPnl ?? before?.netPnl,
      returnPct: incoming.returnPct ?? before?.returnPct,
      commission: incoming.commission ?? before?.commission,
    }
  }

  function notifyTradeCapture(payload) {
    if (!payload?.changes?.length && !payload?.trades?.length) return
    try {
      window.dispatchEvent(new CustomEvent("jb-trade-captured", { detail: payload }))
    } catch {
      // ignore
    }
    try {
      window.postMessage({ source: "jb-main-hook", type: "jb-trade-captured", detail: payload }, "*")
    } catch {
      // ignore
    }
  }

  function currentChartSymbol() {
    const fromHook = String(window.__JB_CHART_SYMBOL__ || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
    return fromHook || "UNKNOWN"
  }

  /** Drop stale captures when the user switches chart (BTC → GOLD etc.). */
  function resetCapturedIfSymbolChanged(symbol) {
    if (!symbol || symbol === "UNKNOWN") return
    const prev = String(window.__JB_CAPTURED_CHART_SYMBOL__ || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
    if (prev && prev !== symbol) {
      window.__JB_CAPTURED_TRADES__ = []
    }
    window.__JB_CAPTURED_CHART_SYMBOL__ = symbol
  }

  function storePayload(payload) {
    try {
      const chartSymbol = currentChartSymbol()
      resetCapturedIfSymbolChanged(chartSymbol)

      const trades = normalizeCapturedTrades(payload)
      if (!trades.length) return

      const beforeMap = new Map(window.__JB_CAPTURED_TRADES__.map((t) => [t.tradeNumber, t]))
      const merged = new Map(beforeMap)
      const changed = []

      for (const incoming of trades) {
        const stamped = {
          ...incoming,
          instrument:
            chartSymbol !== "UNKNOWN"
              ? chartSymbol
              : incoming.instrument || beforeMap.get(incoming.tradeNumber)?.instrument || "UNKNOWN",
        }
        const before = beforeMap.get(stamped.tradeNumber)
        const next = before ? mergeTradeRecord(before, stamped) : stamped
        if (!next.entry?.price) continue

        // Ignore leftovers from a previous symbol still sitting in memory.
        const nextInst = String(next.instrument || "")
          .replace(/[^A-Za-z0-9]/g, "")
          .toUpperCase()
        if (chartSymbol !== "UNKNOWN" && nextInst && nextInst !== "UNKNOWN" && nextInst !== chartSymbol) {
          continue
        }

        const wasOpen = before ? isOpenCapturedTrade(before) : false
        const isOpen = isOpenCapturedTrade(next)

        if (!before || tradeFingerprint(before) !== tradeFingerprint(next)) {
          let reason = before ? "updated" : "new"
          if (before && wasOpen && !isOpen) reason = "closed"
          // Include full trade so background can POST without Strategy Tester scrape.
          changed.push({
            tradeNumber: next.tradeNumber,
            reason,
            trade: next,
            isOpen,
          })
        }

        merged.set(next.tradeNumber, next)
      }

      window.__JB_CAPTURED_TRADES__ = [...merged.values()]

      if (changed.length) {
        notifyTradeCapture({
          changes: changed,
          trades: changed.map((c) => c.trade).filter(Boolean),
          chartSymbol,
          at: Date.now(),
        })
      }
    } catch {
      // ignore malformed payloads
    }
  }

  function maybeCapture(_url, bodyText) {
    if (!bodyText || bodyText.length < 20) return
    try {
      storePayload(JSON.parse(bodyText))
    } catch {
      // ignore non-json
    }
  }

  const originalFetch = window.fetch
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args)
    try {
      const clone = response.clone()
      const text = await clone.text()
      maybeCapture(args[0]?.url || args[0], text)
    } catch {
      // ignore
    }
    return response
  }

  const XHR = XMLHttpRequest.prototype
  const open = XHR.open
  const send = XHR.send
  XHR.open = function (_method, url, ...rest) {
    this.__jbUrl = url
    return open.call(this, _method, url, ...rest)
  }
  XHR.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        maybeCapture(this.__jbUrl, this.responseText)
      } catch {
        // ignore
      }
    })
    return send.apply(this, args)
  }
})()
