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

  function storePayload(payload) {
    try {
      const trades = normalizeCapturedTrades(payload)
      if (trades.length) {
        const merged = new Map(window.__JB_CAPTURED_TRADES__.map((t) => [t.tradeNumber, t]))
        for (const trade of trades) merged.set(trade.tradeNumber, trade)
        window.__JB_CAPTURED_TRADES__ = [...merged.values()]
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
