// Isolated world — parses TradingView ka-table (List of trades).
async function jbMainScrape() {
  const importAll = Boolean(window.__JB_IMPORT_ALL__)

  function parseNumber(value) {
    if (value == null || value === "") return undefined
    const cleaned = String(value).replace(/[^\d.,+\-eE]/g, "").replace(/,/g, "")
    const num = Number.parseFloat(cleaned)
    return Number.isFinite(num) ? num : undefined
  }

  function parseSignedNumber(value) {
    if (value == null || value === "") return undefined
    const negative = /[-−]/.test(String(value))
    const num = parseNumber(value)
    if (typeof num !== "number") return undefined
    return negative && num > 0 ? -num : num
  }

  function parsePercent(value) {
    if (value == null || value === "") return undefined
    return parseSignedNumber(String(value).replace("%", ""))
  }

  function parseSize(value) {
    if (!value) return 1
    return parseNumber(String(value).match(/^([\d.,]+)/)?.[1]) || 1
  }

  function getBacktestingRoot() {
    return document.querySelector('[data-name="backtesting"]') || document.querySelector("#bottom-area") || document.body
  }

  function getStrategyName(root) {
    for (const el of root.querySelectorAll('[class*="title"], [class*="strategyName"]')) {
      const text = el.textContent?.trim()
      if (text && text.length > 2 && !/list of trades|overview|metrics|performance/i.test(text)) return text
    }
    return "TradingView Strategy"
  }

  function getInstrumentSymbol() {
    if (window.__JB_CHART_SYMBOL__) {
      return String(window.__JB_CHART_SYMBOL__).replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }

    const legend = document.querySelector('[data-name="legend-source-title"]')
    if (legend?.textContent?.trim()) {
      const text = legend.textContent.trim()
      if (/gold/i.test(text)) return "XAUUSD"
      if (/silver/i.test(text)) return "XAGUSD"
      if (/oil|crude|wti/i.test(text)) return "USOIL"
      const decoded = text.replace(/%3A/gi, ":")
      const pair = decoded.includes(":") ? decoded.split(":").pop() : decoded
      return pair.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }

    const url = location.href
    const symbolParam = url.match(/symbol=([^&]+)/i)
    if (symbolParam) {
      const decoded = decodeURIComponent(symbolParam[1]).replace(/%3A/gi, ":")
      const pair = decoded.split(":").pop() || decoded
      return pair.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }

    const fromTitle = (document.title || "").split(",")[0]?.trim() || ""
    if (/gold/i.test(fromTitle)) return "XAUUSD"
    if (/silver/i.test(fromTitle)) return "XAGUSD"
    if (/oil|crude|wti/i.test(fromTitle)) return "USOIL"
    if (fromTitle) return fromTitle.replace(/[^A-Za-z0-9]/g, "").toUpperCase()

    return "UNKNOWN"
  }

  function clickListOfTradesTab(root) {
    for (const el of root.querySelectorAll("button, [role='tab'], span, div")) {
      if (/^list of trades$/i.test((el.textContent || "").trim())) {
        try {
          el.click()
        } catch {
          // ignore
        }
        return true
      }
    }
    return false
  }

  function getCellParts(td) {
    if (!td) return ["", ""]

    const double = td.querySelector('[class*="doubleCell"]')
    if (double) {
      const part0 = double.querySelector('[data-part="0"]')?.textContent?.replace(/\s+/g, " ").trim() || ""
      const part1 = double.querySelector('[data-part="1"]')?.textContent?.replace(/\s+/g, " ").trim() || ""
      return [part0, part1]
    }

    const twoRows = td.querySelector('[class*="twoRows"]')
    if (twoRows) {
      const values = [...twoRows.querySelectorAll('[class*="value"]')]
      if (values.length >= 2) {
        return [
          values[0].textContent?.replace(/\s+/g, " ").trim() || "",
          values[1].textContent?.replace(/\s+/g, " ").trim() || "",
        ]
      }
      const kids = [...twoRows.children].filter((c) => c.textContent?.trim())
      if (kids.length >= 2) {
        return [
          kids[0].textContent?.replace(/\s+/g, " ").trim() || "",
          kids[1].textContent?.replace(/\s+/g, " ").trim() || "",
        ]
      }
      if (kids.length === 1) return ["", kids[0].textContent?.replace(/\s+/g, " ").trim() || ""]
    }

    const text = td.textContent?.replace(/\s+/g, " ").trim() || ""
    return [text, ""]
  }

  function parseMoneyAndPercent(text) {
    if (!text) return { money: undefined, pct: undefined }
    const pctMatch = text.match(/([+-−]?\d[\d.,]*)\s*%/)
    const money = parseSignedNumber(text.replace(/[+-−]?\d[\d.,]*\s*%/g, ""))
    const pct = pctMatch ? parseSignedNumber(pctMatch[1]) : undefined
    return { money, pct }
  }

  function getExitText(entryPart, exitPart, td) {
    return exitPart || entryPart || td?.textContent?.replace(/\s+/g, " ").trim() || ""
  }

  function getDatetimePair(td) {
    if (!td) return ["", ""]

    const twoRows = td.querySelector('[class*="twoRows"]')
    if (twoRows) {
      const rows = [...twoRows.children].filter((child) => child.textContent?.trim())
      if (rows.length >= 2) {
        return [
          rows[0].innerText.replace(/\s+/g, " ").trim(),
          rows[1].innerText.replace(/\s+/g, " ").trim(),
        ]
      }
      if (rows.length === 1) {
        return [rows[0].innerText.replace(/\s+/g, " ").trim(), ""]
      }
    }

    return getCellParts(td)
  }

  function getColumn(row, qaId) {
    return row.querySelector(`[data-qa-id="${qaId}"]`)
  }

  function findKaTables(root) {
    return [...root.querySelectorAll("table.ka-table, table[data-selector='table']")]
  }

  function findTableScroller(root) {
    return (
      root.querySelector(".ka-table-wrapper") ||
      root.querySelector('[class*="tableWrapper"]') ||
      root.querySelector('[class*="ka-table"]')?.parentElement
    )
  }

  function parseKaTableRows(tables, instrument, strategy) {
    const trades = new Map()

    for (const table of tables) {
      const rows = table.querySelectorAll("tbody tr.ka-row[data-row-id], tbody tr[data-row-id], tbody tr.ka-row")

      for (const row of rows) {
        const tradeText = getColumn(row, "column-trade-number")?.textContent?.replace(/\s+/g, " ").trim() || ""
        const match = tradeText.match(/^(\d+)\s*(long|short)?/i)
        if (!match) continue

        const tradeNumber = Number.parseInt(match[1], 10)
        const direction = (match[2] || tradeText).toLowerCase().includes("short") ? "short" : "long"

        const [entryDt, exitDtRaw] = getDatetimePair(getColumn(row, "column-datetime"))
        let entryDtFinal = entryDt
        let exitDt = exitDtRaw
        if (entryDt && exitDt && new Date(exitDt).getTime() < new Date(entryDt).getTime()) {
          ;[entryDtFinal, exitDt] = [exitDt, entryDt]
        }
        const [entrySignal, exitSignal] = getCellParts(getColumn(row, "column-signal"))
        const [entryPriceText, exitPriceText] = getCellParts(getColumn(row, "column-price"))
        const [entrySizeText] = getCellParts(
          getColumn(row, "column-size") ||
            getColumn(row, "column-position-size") ||
            getColumn(row, "column-qty"),
        )
        const profitTd =
          getColumn(row, "column-profit") ||
          getColumn(row, "column-net-pnl") ||
          getColumn(row, "column-pnl")
        const [entryProfit, exitProfit] = getCellParts(profitTd)
        const profitText = getExitText(entryProfit, exitProfit, profitTd)
        const { money: netPnl, pct: returnFromProfit } = parseMoneyAndPercent(profitText)

        const pctTd =
          getColumn(row, "column-profit-percent") ||
          getColumn(row, "column-return") ||
          getColumn(row, "column-run-up")
        const [entryPct, exitPct] = getCellParts(pctTd)
        const returnPct = parsePercent(getExitText(entryPct, exitPct, pctTd)) ?? returnFromProfit

        const commTd = getColumn(row, "column-commission")
        const [entryComm, exitComm] = getCellParts(commTd)
        const commission = parseNumber(getExitText(entryComm, exitComm, commTd))

        const entryPrice = parseNumber(entryPriceText)
        if (!entryDtFinal || entryPrice == null) continue

        const trade = {
          tradeNumber,
          direction,
          instrument,
          strategy,
          entry: {
            datetime: entryDtFinal,
            price: entryPrice,
            signal: entrySignal || "",
            size: parseSize(entrySizeText),
          },
          exit: null,
        }

        const exitPrice = parseNumber(exitPriceText)
        if (exitDt && exitPrice != null) {
          trade.exit = { datetime: exitDt, price: exitPrice, signal: exitSignal || "" }
          if (netPnl != null) trade.netPnl = netPnl
          if (returnPct != null) trade.returnPct = returnPct
          if (commission != null) trade.commission = commission
        }

        trades.set(tradeNumber, trade)
      }
    }

    return [...trades.values()]
  }

  function collectTrades(root, instrument, strategy) {
    const tables = findKaTables(root)
    const trades = parseKaTableRows(tables, instrument, strategy)
    const rowCount = tables.reduce(
      (n, t) => n + t.querySelectorAll("tbody tr[data-row-id], tbody tr.ka-row").length,
      0,
    )
    return { trades, tablesFound: tables.length, rowCount }
  }

  const root = getBacktestingRoot()
  clickListOfTradesTab(root)
  await new Promise((r) => setTimeout(r, 400))

  const strategy = getStrategyName(root)
  const instrument = getInstrumentSymbol()
  const scroller =
    findTableScroller(root) ||
    root.querySelector('[class*="scroll"]') ||
    root.querySelector('[style*="overflow"]')

  const collected = new Map()
  let lastStats = { tablesFound: 0, rowCount: 0 }

  const ingest = () => {
    const result = collectTrades(root, instrument, strategy)
    lastStats = result
    for (const t of result.trades) collected.set(t.tradeNumber, t)
  }

  ingest()

  if (scroller) {
    const maxSteps = importAll ? 300 : 15
    scroller.scrollTop = 0
    await new Promise((r) => setTimeout(r, 150))
    ingest()

    let stable = 0
    let last = collected.size
    for (let i = 0; i < maxSteps && stable < 8; i++) {
      scroller.scrollTop += Math.max(60, scroller.clientHeight * 0.75)
      await new Promise((r) => setTimeout(r, 80))
      ingest()
      if (collected.size === last) stable += 1
      else {
        stable = 0
        last = collected.size
      }
    }

    scroller.scrollTop = scroller.scrollHeight
    await new Promise((r) => setTimeout(r, 200))
    ingest()
  }

  const trades = [...collected.values()].sort((a, b) => b.tradeNumber - a.tradeNumber)

  return {
    trades,
    strategy,
    instrument,
    frameUrl: location.href,
    debug: {
      method: "ka-table",
      tradesParsed: trades.length,
      importAll,
      tablesFound: lastStats.tablesFound,
      rowCount: lastStats.rowCount,
      hasScroller: Boolean(scroller),
      hasListOfTradesText: /list of trades/i.test(root.innerText || ""),
    },
    error: trades.length
      ? undefined
      : `ka-table: ${lastStats.rowCount} rows found, 0 parsed. Open List of trades tab.`,
  }
}

jbMainScrape().catch((err) => ({
  trades: [],
  strategy: "TradingView Strategy",
  instrument: window.__JB_CHART_SYMBOL__ || "UNKNOWN",
  frameUrl: location.href,
  debug: { scraperCrash: true, message: String(err?.message || err) },
  error: String(err?.message || err),
}))
