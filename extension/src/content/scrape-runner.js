async function jbScrapeTrades() {
  const importAll = Boolean(window.__JB_IMPORT_ALL__)

  function deepQueryAll(selector, root = document) {
    const results = []
    const visit = (node) => {
      if (!node) return
      results.push(...node.querySelectorAll(selector))
      node.querySelectorAll("*").forEach((el) => {
        if (el.shadowRoot) visit(el.shadowRoot)
      })
    }
    visit(root)
    return results
  }

  function parseNumber(value) {
    if (!value) return undefined
    const cleaned = String(value).replace(/[^\d.,+\-]/g, "").replace(/,/g, "")
    const num = Number.parseFloat(cleaned)
    return Number.isFinite(num) ? num : undefined
  }

  function parseSignedNumber(value) {
    if (!value) return undefined
    const negative = String(value).includes("-") || String(value).includes("−")
    const num = parseNumber(value)
    if (typeof num !== "number") return undefined
    return negative && num > 0 ? -num : num
  }

  function parsePercent(value) {
    if (!value) return undefined
    return parseSignedNumber(String(value).replace("%", ""))
  }

  function parseSize(value) {
    if (!value) return 1
    const match = String(value).match(/^([\d.,]+)/)
    return match ? parseNumber(match[1]) || 1 : 1
  }

  function getStrategyName() {
    for (const el of deepQueryAll('[data-name="backtesting"] [class*="title"], [class*="strategyName"]')) {
      const text = el.textContent?.trim()
      if (text && text.length > 3 && !/list of trades|overview|metrics|performance/i.test(text)) return text
    }
    return "TradingView Strategy"
  }

  function getInstrumentSymbol() {
    const fromTitle = (document.title || "").split(",")[0]?.trim()
    if (fromTitle) return fromTitle.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    for (const el of deepQueryAll('[data-name="legend-source-title"]')) {
      if (el.textContent?.trim()) return el.textContent.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    }
    return "BTCUSDT"
  }

  function getRowCells(row) {
    const tds = [...row.querySelectorAll("td")]
    if (tds.length >= 4) return tds.map((td) => td.textContent?.replace(/\s+/g, " ").trim() || "")

    const roleCells = [...row.querySelectorAll('[role="cell"], [class*="cell"]')]
    if (roleCells.length >= 4) return roleCells.map((c) => c.textContent?.replace(/\s+/g, " ").trim() || "")

    return (row.innerText || "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean)
  }

  function findBacktestingRoot() {
    return (
      deepQueryAll('[data-name="backtesting"]')[0] ||
      deepQueryAll('[class*="backtesting"]')[0] ||
      document.querySelector("#bottom-area") ||
      document.body
    )
  }

  function findTradeRows(root) {
    const rows = new Set()
    for (const tr of deepQueryAll("tr", root)) {
      if (/entry|exit/i.test(tr.textContent || "") && /\d+/.test(tr.textContent || "")) rows.add(tr)
    }
    for (const row of deepQueryAll('[role="row"]', root)) {
      if (/entry|exit/i.test(row.textContent || "") && /\d+/.test(row.textContent || "")) rows.add(row)
    }
    return [...rows]
  }

  function findContainer(root) {
    for (const table of deepQueryAll("table", root)) {
      const text = table.textContent || ""
      if (/entry/i.test(text) && /exit/i.test(text)) return table
    }
    return root
  }

  function findScrollContainer(start) {
    let node = start
    while (node) {
      const style = window.getComputedStyle(node)
      if (node.scrollHeight > node.clientHeight + 8 && /(auto|scroll|overlay)/.test(style.overflowY)) return node
      node = node.parentElement
    }
    return null
  }

  function parseRows(rows, instrument, strategy) {
    const trades = new Map()
    for (const row of rows) {
      const cells = getRowCells(row)
      if (cells.length < 3) continue

      const joined = cells.join(" | ")
      const tradeMatch = joined.match(/(\d+)\s*(long|short)?/i)
      if (!tradeMatch) continue

      const tradeNumber = Number.parseInt(tradeMatch[1], 10)
      const direction = (tradeMatch[2] || joined).toLowerCase().includes("short") ? "short" : "long"
      let typeIdx = cells.findIndex((c) => /^entry$/i.test(c.trim()))
      if (typeIdx < 0) typeIdx = cells.findIndex((c) => /^exit$/i.test(c.trim()))
      if (typeIdx < 0) continue

      const type = /^entry$/i.test(cells[typeIdx].trim()) ? "entry" : "exit"
      const datetime = cells[typeIdx + 1] || ""
      const signal = cells[typeIdx + 2] || ""
      const price = parseNumber(cells[typeIdx + 3])
      if (!datetime || !price) continue

      const existing = trades.get(tradeNumber) || { tradeNumber, direction, instrument, strategy, entry: null, exit: null }
      if (type === "entry") {
        existing.entry = { datetime, price, signal, size: parseSize(cells[typeIdx + 4]) }
        existing.direction = direction
      } else {
        existing.exit = { datetime, price, signal }
        existing.netPnl = parseSignedNumber(cells[typeIdx + 5])
        existing.returnPct = parsePercent(cells[typeIdx + 6])
        existing.commission = parseNumber(cells[typeIdx + 7])
      }
      trades.set(tradeNumber, existing)
    }
    return [...trades.values()].filter((t) => t.entry)
  }

  function parseFromFlatLines(root, instrument, strategy) {
    const lines = (root.innerText || "").split("\n").map((l) => l.trim()).filter(Boolean)
    const trades = new Map()

    for (let i = 0; i < lines.length; i++) {
      const header = lines[i].match(/^(\d+)\s+(long|short)$/i)
      if (!header) continue

      const tradeNumber = Number.parseInt(header[1], 10)
      const direction = header[2].toLowerCase()

      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        if (/^\d+\s+(long|short)$/i.test(lines[j])) break
        if (/^entry$/i.test(lines[j])) {
          const datetime = lines[j + 1] || ""
          const signal = lines[j + 2] || ""
          const price = parseNumber(lines[j + 3])
          if (!datetime || !price) break
          const existing = trades.get(tradeNumber) || { tradeNumber, direction, instrument, strategy, entry: null, exit: null }
          existing.entry = { datetime, price, signal, size: parseSize(lines[j + 4]) }
          trades.set(tradeNumber, existing)
          break
        }
        if (/^exit$/i.test(lines[j])) {
          const datetime = lines[j + 1] || ""
          const signal = lines[j + 2] || ""
          const price = parseNumber(lines[j + 3])
          if (!datetime || !price) break
          const existing = trades.get(tradeNumber) || { tradeNumber, direction, instrument, strategy, entry: null, exit: null }
          existing.exit = { datetime, price, signal }
          existing.netPnl = parseSignedNumber(lines[j + 5])
          trades.set(tradeNumber, existing)
          break
        }
      }
    }
    return [...trades.values()].filter((t) => t.entry)
  }

  function scrapeDom(root, instrument, strategy) {
    const container = findContainer(root)
    const rows =
      container.tagName === "TABLE"
        ? [...container.querySelectorAll("tbody tr, tr")].filter((r) => /entry|exit/i.test(r.textContent || ""))
        : findTradeRows(container)

    const fromRows = parseRows(rows, instrument, strategy)
    const fromLines = parseFromFlatLines(root, instrument, strategy)
    const merged = new Map()
    for (const trade of [...fromRows, ...fromLines]) merged.set(trade.tradeNumber, trade)
    return { trades: [...merged.values()], rowsFound: rows.length }
  }

  function buildResult(trades, rowsFound, strategy, instrument, extra = {}) {
    return {
      trades,
      strategy,
      instrument,
      debug: { rowsFound, tradesParsed: trades.length, ...extra },
      error: trades.length
        ? undefined
        : `Could not parse trades (${rowsFound} rows found). Open List of Trades, refresh page (F5), try again.`,
    }
  }

  async function readCapturedFromMainWorld() {
    return []
  }

  const root = findBacktestingRoot()
  const strategy = getStrategyName()
  const instrument = getInstrumentSymbol()

  const captured = await readCapturedFromMainWorld()
  if (captured.length) {
    return buildResult(
      captured.map((t) => ({ ...t, instrument: t.instrument || instrument, strategy: t.strategy || strategy })),
      captured.length,
      strategy,
      instrument,
      { method: "api-capture" },
    )
  }

  if (!importAll) {
    const { trades, rowsFound } = scrapeDom(root, instrument, strategy)
    return buildResult(trades, rowsFound, strategy, instrument, { method: "dom" })
  }

  const scrollContainer = findScrollContainer(findContainer(root)) || findScrollContainer(root)
  const collected = new Map()
  const ingest = () => {
    for (const trade of scrapeDom(root, instrument, strategy).trades) collected.set(trade.tradeNumber, trade)
  }

  ingest()
  let rowsFound = collected.size

  if (scrollContainer) {
    scrollContainer.scrollTop = 0
    await new Promise((r) => setTimeout(r, 300))
    let stable = 0
    let last = collected.size
    for (let i = 0; i < 15 && stable < 3; i++) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
      await new Promise((r) => setTimeout(r, 250))
      ingest()
      if (collected.size === last) stable += 1
      else {
        stable = 0
        last = collected.size
        rowsFound = collected.size
      }
    }
  }

  const trades = [...collected.values()].sort((a, b) => b.tradeNumber - a.tradeNumber)
  return buildResult(trades, rowsFound, strategy, instrument, { method: "dom-scroll", importAll: true })
}

return jbScrapeTrades()
