// Isolated world — parses TradingView ka-table (List of trades).
async function jbMainScrape() {
  const importAll = Boolean(window.__JB_IMPORT_ALL__)
  // light = poll/instant (top rows only). full = manual Import All.
  const scrapeMode =
    window.__JB_SCRAPE_MODE__ === "full" || importAll
      ? "full"
      : window.__JB_SCRAPE_MODE__ === "light"
        ? "light"
        : "light"

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

  function clickFirst(selectors, root = document) {
    for (const selector of selectors) {
      const el = root.querySelector(selector)
      if (!el) continue
      try {
        el.click()
        return true
      } catch {
        // ignore
      }
    }
    return false
  }

  function clickByText(patterns, root = document) {
    const nodes = root.querySelectorAll("button, [role='tab'], [role='button'], a, span, div")
    for (const el of nodes) {
      const text = (el.textContent || "").replace(/\s+/g, " ").trim()
      if (!text || text.length > 48) continue
      if (!patterns.some((re) => re.test(text))) continue
      try {
        el.click()
        return true
      } catch {
        // ignore
      }
    }
    return false
  }

  /** Open Strategy Tester panel if collapsed, then switch to List of trades. */
  async function ensureListOfTradesVisible(root) {
    // Open bottom Strategy Tester / backtesting panel.
    clickByText([/^strategy tester$/i, /^strategy$/i], document)
    clickFirst(
      [
        '[data-name="backtesting"]',
        '[data-name="strategy-tester"]',
        'button[aria-label*="Strategy Tester" i]',
        'button[aria-label*="Strategy" i]',
      ],
      document,
    )
    await new Promise((r) => setTimeout(r, 250))

    const scopes = [root, document.querySelector("#bottom-area"), document].filter(Boolean)
    let clicked = false
    for (const scope of scopes) {
      if (
        clickByText(
          [/^list of trades$/i, /^list of trades/i, /^trades$/i, /^операции$/i, /^trades list$/i],
          scope,
        )
      ) {
        clicked = true
        break
      }
    }

    await new Promise((r) => setTimeout(r, clicked ? 700 : 400))
    return clicked
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

  let root = getBacktestingRoot()
  // Only click around if the trade table isn't already visible (saves ~1s on every poll).
  const alreadyHasRows = findKaTables(root).some(
    (table) => table.querySelectorAll("tbody tr[data-row-id], tbody tr.ka-row").length > 0,
  )
  if (!alreadyHasRows) {
    await ensureListOfTradesVisible(root)
    root = getBacktestingRoot()
  }

  const strategy = getStrategyName(root)
  const instrument = getInstrumentSymbol()

  const collected = new Map()
  let lastStats = { tablesFound: 0, rowCount: 0 }

  const ingest = () => {
    const activeRoot = getBacktestingRoot()
    const result = collectTrades(activeRoot, instrument, strategy)
    lastStats = result
    for (const t of result.trades) collected.set(t.tradeNumber, t)
    return findTableScroller(activeRoot)
  }

  let scroller = ingest()

  // Retry once if Overview/Performance is still showing.
  if (!collected.size) {
    await ensureListOfTradesVisible(getBacktestingRoot())
    scroller = ingest()
  }

  if (scroller) {
    // Opens + newest closes sit at the TOP of List of trades.
    scroller.scrollTop = 0
    await new Promise((r) => setTimeout(r, scrapeMode === "light" ? 40 : 150))
    ingest()

    if (scrapeMode === "full") {
      // Manual Import All — walk the whole virtualized table.
      const maxSteps = 300
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
    } else {
      // Poll/instant — only peek a couple viewports below the top. Never full-scan.
      for (let i = 0; i < 2; i++) {
        scroller.scrollTop += Math.max(80, scroller.clientHeight * 0.9)
        await new Promise((r) => setTimeout(r, 45))
        ingest()
      }
      scroller.scrollTop = 0
    }
  }

  let trades = [...collected.values()].sort((a, b) => b.tradeNumber - a.tradeNumber)

  // Poll only needs the newest slice (opens + latest exits). Cap hard.
  if (scrapeMode === "light" && trades.length > 40) {
    trades = trades.slice(0, 40)
  }

  const hasListTab = /list of trades/i.test((getBacktestingRoot().innerText || "") + (document.body?.innerText || ""))

  return {
    trades,
    strategy,
    instrument,
    frameUrl: location.href,
    debug: {
      method: "ka-table",
      scrapeMode,
      tradesParsed: trades.length,
      importAll,
      tablesFound: lastStats.tablesFound,
      rowCount: lastStats.rowCount,
      hasScroller: Boolean(scroller),
      hasListOfTradesText: hasListTab,
      skippedFullScan: scrapeMode === "light",
    },
    error: trades.length
      ? undefined
      : hasListTab
        ? "Strategy Tester List of trades is open but empty — wait for a trade fill, or run the strategy once."
        : "Strategy Tester → open bottom panel → click “List of trades” (Overview pe mat chhodo).",
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
