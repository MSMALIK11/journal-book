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
    const withoutNotional = String(value).replace(/[\d.,]+\s*[KkMm]\b[\s\S]*/g, " ").trim()
    const num = parseNumber(withoutNotional.match(/(\d+(?:[.,]\d+)?)/)?.[1])
    return Number.isFinite(num) && num > 0 ? num : 1
  }

  function trustedFillPnl(direction, entryPrice, exitPrice, size) {
    if (entryPrice == null || exitPrice == null) return undefined
    const signed = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
    const qty = size > 20 ? 10 : size > 0 ? size : 1
    return Math.round(signed * qty * 100) / 100
  }

  function fillSlack(reference, fill) {
    return Math.max(2, Math.abs(fill) * 0.35, Math.abs(reference) * 0.06)
  }

  function alignPricesFromTvPnl(direction, entryPrice, exitPrice, size, netPnl) {
    if (entryPrice == null || exitPrice == null || typeof netPnl !== "number") {
      return { entryPrice, exitPrice, netPnl }
    }
    const fill = trustedFillPnl(direction, entryPrice, exitPrice, size)
    if (typeof fill !== "number") return { entryPrice, exitPrice, netPnl }
    const slack = fillSlack(netPnl, fill)
    if (Math.abs(netPnl - fill) <= slack) return { entryPrice, exitPrice, netPnl }
    const swappedFill = trustedFillPnl(direction, exitPrice, entryPrice, size)
    if (
      typeof swappedFill === "number" &&
      Math.abs(netPnl - swappedFill) <= slack
    ) {
      return { entryPrice: exitPrice, exitPrice: entryPrice, netPnl }
    }
    if (
      Math.sign(netPnl) !== Math.sign(fill) &&
      Math.abs(Math.abs(netPnl) - Math.abs(fill)) <= slack
    ) {
      return { entryPrice: exitPrice, exitPrice: entryPrice, netPnl }
    }
    return { entryPrice, exitPrice, netPnl }
  }

  function clampScrapedPnl(direction, entryPrice, exitPrice, size, netPnl) {
    if (typeof netPnl !== "number") return netPnl
    const aligned = alignPricesFromTvPnl(direction, entryPrice, exitPrice, size, netPnl)
    const fill = trustedFillPnl(direction, aligned.entryPrice, aligned.exitPrice, size)
    if (typeof fill !== "number") return netPnl
    const slack = fillSlack(netPnl, fill)
    if (Math.abs(netPnl - fill) <= slack) return netPnl
    if (Math.sign(netPnl) !== Math.sign(fill) && Math.abs(Math.abs(netPnl) - Math.abs(fill)) <= slack) {
      return netPnl
    }
    return fill
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
      if (/bank\s*nifty/i.test(text)) return "BANKNIFTY"
      if (/nifty/i.test(text)) return "NIFTY"
      if (/sensex/i.test(text)) return "SENSEX"
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

  /** TV live row: exit Date/time and Signal are the word "Open", Type stays Long/Short. */
  function isLiteralOpenToken(value) {
    return /^open$/i.test(String(value || "").trim())
  }

  function isTpSlSignal(value) {
    return /\b(tp\/sl|take\s*profit|stop\s*loss|\btp\b|\bsl\b|stop|target)\b/i.test(String(value || "").trim())
  }

  function hasTpSlPrices(value) {
    const text = String(value || "").trim()
    return /\bTP\s*:\s*[\d,.]+/i.test(text) && /\bSL\s*:\s*[\d,.]+/i.test(text)
  }

  function pairKeyFromInstrument(symbol) {
    const t = String(symbol || "").toUpperCase()
    if (/XAU|GOLD/.test(t)) return "GOLD"
    if (/BTC/.test(t)) return "BTC"
    if (/ETH/.test(t)) return "ETH"
    if (/SOL/.test(t)) return "SOLUSD"
    if (/XAG|SILVER/.test(t)) return "XAGUSD"
    if (/OIL|USOIL|WTI/.test(t)) return "USOIL"
    return ""
  }

  /** EMA scanner dashboard SL/TP column — TV List of Trades Signal often shows only SHORT/LONG. */
  function scrapeScannerSlTpOverlay(pairKey, direction) {
    if (!pairKey) return ""

    const sideHint = direction === "short" ? "SHORT" : direction === "long" ? "LONG" : "(?:SHORT|LONG)"
    const levelRe = new RegExp(
      `\\b${sideHint}\\s*\\|\\s*TP\\s*:\\s*([\\d,.]+)\\s*\\|\\s*SL\\s*:\\s*([\\d,.]+)`,
      "i",
    )

    const roots = [
      document.querySelector("#overlap-manager-root"),
      document.querySelector(".chart-markup-table"),
      document.querySelector(".chart-container"),
      document.body,
    ].filter(Boolean)

    for (const root of roots) {
      for (const row of root.querySelectorAll("tr")) {
        const cells = [...row.querySelectorAll("td, th")]
        if (cells.length < 2) continue
        const pairText = cells[0]?.textContent?.replace(/\s+/g, " ").trim() || ""
        if (pairText !== pairKey) continue
        const slTpCell = cells[7] || cells[cells.length - 1]
        const slTpText = slTpCell?.textContent?.replace(/\s+/g, " ").trim() || ""
        if (hasTpSlPrices(slTpText)) return slTpText
      }

      const blob = root.innerText?.replace(/\s+/g, " ") || ""
      const idx = blob.indexOf(pairKey)
      if (idx < 0) continue
      const slice = blob.slice(idx, idx + 320)
      const match = slice.match(levelRe)
      if (match) {
        const side = slice.match(/\b(SHORT|LONG)\b/i)?.[1]?.toUpperCase() || sideHint.replace(/[()?]/g, "")
        return `${side} | TP: ${match[1]} | SL: ${match[2]}`
      }
    }

    return ""
  }

  function readSignalParts(signalTd, instrument, direction, looksOpen, entrySignal, exitSignal) {
    const fullText = signalTd?.textContent?.replace(/\s+/g, " ").trim() || ""
    const title =
      signalTd?.getAttribute("title")?.trim() ||
      signalTd?.querySelector("[title]")?.getAttribute("title")?.trim() ||
      ""

    for (const candidate of [entrySignal, fullText, title]) {
      if (hasTpSlPrices(candidate)) {
        entrySignal = candidate
        break
      }
    }

    if (looksOpen && !hasTpSlPrices(entrySignal)) {
      const overlay = scrapeScannerSlTpOverlay(pairKeyFromInstrument(instrument), direction)
      if (overlay) entrySignal = overlay
    }

    return [entrySignal, exitSignal]
  }

  function datetimeMs(value) {
    if (!value || isLiteralOpenToken(value)) return NaN
    const ms = new Date(value).getTime()
    return Number.isFinite(ms) ? ms : NaN
  }

  function isFlatMtmOpen(entryPrice, exitPrice, netPnl, returnPct, exitSignal) {
    if (isTpSlSignal(exitSignal)) return false
    if (entryPrice == null || exitPrice == null || entryPrice <= 0) return false
    if (Math.abs(exitPrice - entryPrice) / entryPrice > 0.0002) return false
    if (typeof netPnl === "number" && Math.abs(netPnl) > 0.01) return false
    if (typeof returnPct === "number" && Math.abs(returnPct) > 0.01) return false
    return true
  }

  function isPaintedMtmOpen(entryDt, exitDt, entryPrice, exitPrice) {
    if (!entryDt || !exitDt || isLiteralOpenToken(entryDt) || isLiteralOpenToken(exitDt)) return false
    if (entryPrice == null || exitPrice == null) return false
    const entryMs = datetimeMs(entryDt)
    const exitMs = datetimeMs(exitDt)
    if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || entryPrice <= 0) return false
    return Math.abs(exitMs - entryMs) <= 90_000 && Math.abs(exitPrice - entryPrice) / entryPrice <= 0.0002
  }

  function cellMentionsOpen(value) {
    return /\bopen\b/i.test(String(value || "").trim())
  }

  /** Live quote + unrealized P&L on exit half — not a reversal close at the same fill. */
  function isMtmUnrealizedOpen(entryDt, exitDt, entryPrice, exitPrice, exitSignal, netPnl, returnPct) {
    if (isLiteralOpenToken(exitDt) || isLiteralOpenToken(exitSignal)) return true
    if (isTpSlSignal(exitSignal)) return false
    const entryMs = datetimeMs(entryDt)
    const exitMs = datetimeMs(exitDt)
    if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || exitMs <= entryMs) return false
    if (netPnl == null && returnPct == null) return false
    if (entryPrice == null || exitPrice == null || entryPrice <= 0) return false
    return Math.abs(exitPrice - entryPrice) / entryPrice > 0.0002
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

        const datetimeTd = getColumn(row, "column-datetime")
        const [entryDt, exitDtRaw] = getDatetimePair(datetimeTd)
        const datetimeRaw = datetimeTd?.textContent?.replace(/\s+/g, " ").trim() || ""
        let entryDtFinal = entryDt
        let exitDt = exitDtRaw
        const signalTd = getColumn(row, "column-signal")
        const signalRaw = signalTd?.textContent?.replace(/\s+/g, " ").trim() || ""
        const typeTd =
          getColumn(row, "column-type") ||
          getColumn(row, "column-trade-type") ||
          row.querySelector('[data-qa-id*="type" i]')
        let [entrySignal, exitSignal] = getCellParts(signalTd)
        const typeText = `${typeTd?.textContent || ""}`.replace(/\s+/g, " ").trim()
        let [entryPriceText, exitPriceText] = getCellParts(getColumn(row, "column-price"))
        const entryPricePreview = parseNumber(entryPriceText)
        const exitPricePreview = parseNumber(exitPriceText)
        const leftoverOpen =
          isLiteralOpenToken(entrySignal) ||
          isLiteralOpenToken(exitSignal) ||
          cellMentionsOpen(datetimeRaw) ||
          cellMentionsOpen(signalRaw)
        const confirmedTpSl = isTpSlSignal(exitSignal) && !isLiteralOpenToken(exitSignal)
        const paintedMtm = isPaintedMtmOpen(entryDt, exitDtRaw, entryPricePreview, exitPricePreview)
        const profitTdPreview =
          getColumn(row, "column-profit") ||
          getColumn(row, "column-net-pnl") ||
          getColumn(row, "column-pnl")
        const [entryProfitPreview, exitProfitPreview] = getCellParts(profitTdPreview)
        const profitTextPreview = getExitText(entryProfitPreview, exitProfitPreview, profitTdPreview)
        const { money: netPnlPreview, pct: returnFromProfitPreview } = parseMoneyAndPercent(profitTextPreview)
        const pctTdPreview =
          getColumn(row, "column-profit-percent") ||
          getColumn(row, "column-return") ||
          getColumn(row, "column-run-up")
        const [entryPctPreview, exitPctPreview] = getCellParts(pctTdPreview)
        const returnPctPreview =
          parsePercent(getExitText(entryPctPreview, exitPctPreview, pctTdPreview)) ?? returnFromProfitPreview
        const mtmUnrealized = isMtmUnrealizedOpen(
          entryDtFinal,
          exitDtRaw,
          entryPricePreview,
          exitPricePreview,
          exitSignal,
          netPnlPreview,
          returnPctPreview,
        )
        let looksOpen =
          isLiteralOpenToken(typeText) ||
          isLiteralOpenToken(entryDt) ||
          isLiteralOpenToken(exitDtRaw) ||
          paintedMtm ||
          (leftoverOpen && !confirmedTpSl) ||
          (mtmUnrealized && !confirmedTpSl)

        ;[entrySignal, exitSignal] = readSignalParts(signalTd, instrument, direction, looksOpen, entrySignal, exitSignal)

        if (
          !looksOpen &&
          !confirmedTpSl &&
          isFlatMtmOpen(
            entryPricePreview,
            exitPricePreview,
            netPnlPreview,
            returnPctPreview,
            exitSignal,
          )
        ) {
          looksOpen = true
        }

        // Exit half is the "Open" token (often painted on top). Other half is the fill.
        if (looksOpen && isLiteralOpenToken(entryDtFinal) && exitDt && !isLiteralOpenToken(exitDt)) {
          ;[entryDtFinal, exitDt] = [exitDt, entryDtFinal]
          ;[entryPriceText, exitPriceText] = [exitPriceText, entryPriceText]
          ;[entrySignal, exitSignal] = [exitSignal, entrySignal]
        } else if (
          !looksOpen &&
          entryDt &&
          exitDt &&
          !isLiteralOpenToken(entryDt) &&
          !isLiteralOpenToken(exitDt) &&
          new Date(exitDt).getTime() < new Date(entryDt).getTime()
        ) {
          ;[entryDtFinal, exitDt] = [exitDt, entryDt]
          ;[entryPriceText, exitPriceText] = [exitPriceText, entryPriceText]
          ;[entrySignal, exitSignal] = [exitSignal, entrySignal]
        }
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

        let entryPrice = parseNumber(entryPriceText)
        if (!entryDtFinal || isLiteralOpenToken(entryDtFinal) || entryPrice == null) continue

        let exitPrice = parseNumber(exitPriceText)
        if (
          !looksOpen &&
          exitDt &&
          !isLiteralOpenToken(exitDt) &&
          exitPrice != null &&
          netPnl != null
        ) {
          const aligned = alignPricesFromTvPnl(
            direction,
            entryPrice,
            exitPrice,
            parseSize(entrySizeText),
            netPnl,
          )
          entryPrice = aligned.entryPrice
          exitPrice = aligned.exitPrice
        }

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

        if (looksOpen) {
          trade.exit = {
            datetime: isLiteralOpenToken(exitDt) ? entryDtFinal : exitDt || entryDtFinal,
            price: exitPrice != null ? exitPrice : entryPrice,
            signal: "Open",
          }
        } else if (exitDt && !isLiteralOpenToken(exitDt) && exitPrice != null) {
          trade.exit = { datetime: exitDt, price: exitPrice, signal: exitSignal || "" }
          if (netPnl != null) {
            trade.netPnl = clampScrapedPnl(
              direction,
              entryPrice,
              exitPrice,
              trade.entry.size,
              netPnl,
            )
          }
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
    await new Promise((r) => setTimeout(r, scrapeMode === "light" ? 20 : 150))
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
        await new Promise((r) => setTimeout(r, 25))
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
