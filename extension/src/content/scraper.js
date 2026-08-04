const SCRAPER_VERSION = "1.0.0"

function parseNumber(value) {
  if (!value) return undefined
  const cleaned = String(value)
    .replace(/[^\d.,+\-]/g, "")
    .replace(/,/g, "")
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
  const num = parseSignedNumber(value.replace("%", ""))
  return typeof num === "number" ? num : undefined
}

function parseSize(value) {
  if (!value) return 1
  const match = String(value).match(/^([\d.,]+)/)
  return match ? parseNumber(match[1]) || 1 : 1
}

function getStrategyName() {
  const candidates = [
    '[data-name="backtesting"] [class*="title"]',
    '[data-name="backtesting"] h3',
    '[class*="strategyName"]',
    '[class*="backtesting"] [class*="title"]',
  ]

  for (const selector of candidates) {
    const el = document.querySelector(selector)
    if (el?.textContent?.trim()) return el.textContent.trim()
  }

  return "TradingView Strategy"
}

function getInstrumentSymbol() {
  const title = document.title || ""
  const fromTitle = title.split(",")[0]?.trim()
  if (fromTitle && fromTitle.length <= 20) return fromTitle.replace(/[^A-Za-z0-9]/g, "").toUpperCase()

  const symbolEl =
    document.querySelector('[data-name="legend-source-title"]') ||
    document.querySelector('[class*="symbolTitle"]') ||
    document.querySelector("header [class*='symbol']")

  if (symbolEl?.textContent) {
    return symbolEl.textContent.trim().replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  }

  return "BTCUSD"
}

function findTradeTableContainer() {
  const panels = [...document.querySelectorAll('[data-name="backtesting"] table, table')]
  return panels.find((table) => {
    const text = table.textContent || ""
    return /Entry|Exit|Trade #|Net P&L|Return/i.test(text)
  })
}

function findScrollContainer(table) {
  let node = table?.parentElement
  while (node) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 20) {
      return node
    }
    node = node.parentElement
  }
  return null
}

function parseTradeRows(rows, instrument, strategy) {
  const trades = new Map()

  for (const row of rows) {
    const cells = [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim() || "")
    if (cells.length < 5) continue

    const tradeMatch = cells[0].match(/(\d+)\s*(long|short)?/i)
    if (!tradeMatch) continue

    const tradeNumber = Number.parseInt(tradeMatch[1], 10)
    const direction = (tradeMatch[2] || cells[0]).toLowerCase().includes("short") ? "short" : "long"
    const type = cells[1]?.toLowerCase()
    const datetime = cells[2]
    const signal = cells[3] || ""
    const price = parseNumber(cells[4])
    const size = parseSize(cells[5])
    const netPnl = parseSignedNumber(cells[6])
    const returnPct = parsePercent(cells[7])
    const commission = parseNumber(cells[8])

    if (!datetime || !price) continue

    const existing = trades.get(tradeNumber) || {
      tradeNumber,
      direction,
      instrument,
      strategy,
      entry: null,
      exit: null,
      netPnl: undefined,
      returnPct: undefined,
      commission: undefined,
    }

    if (type === "entry") {
      existing.entry = { datetime, price, signal, size }
      existing.direction = direction
    } else if (type === "exit") {
      existing.exit = { datetime, price, signal }
      if (typeof netPnl === "number") existing.netPnl = netPnl
      if (typeof returnPct === "number") existing.returnPct = returnPct
      if (typeof commission === "number") existing.commission = commission
    }

    trades.set(tradeNumber, existing)
  }

  return [...trades.values()].filter((trade) => trade.entry)
}

function scrapeVisibleTrades() {
  const table = findTradeTableContainer()
  if (!table) {
    return { trades: [], strategy: getStrategyName(), instrument: getInstrumentSymbol(), error: "Trade table not found" }
  }

  const rows = [...table.querySelectorAll("tbody tr, tr")].filter((row) => row.querySelector("td"))
  const strategy = getStrategyName()
  const instrument = getInstrumentSymbol()
  const trades = parseTradeRows(rows, instrument, strategy)

  return { trades, strategy, instrument }
}

async function scrollAndCollectTrades() {
  const table = findTradeTableContainer()
  if (!table) return scrapeVisibleTrades()

  const scrollContainer = findScrollContainer(table)
  const collected = new Map()
  const strategy = getStrategyName()
  const instrument = getInstrumentSymbol()

  const collect = () => {
    const rows = [...table.querySelectorAll("tbody tr, tr")].filter((row) => row.querySelector("td"))
    for (const trade of parseTradeRows(rows, instrument, strategy)) {
      collected.set(trade.tradeNumber, trade)
    }
  }

  collect()

  if (scrollContainer) {
    scrollContainer.scrollTop = 0
    await new Promise((resolve) => setTimeout(resolve, 250))

    let stablePasses = 0
    let lastCount = 0

    while (stablePasses < 3) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight
      await new Promise((resolve) => setTimeout(resolve, 300))
      collect()

      if (collected.size === lastCount) {
        stablePasses += 1
      } else {
        stablePasses = 0
        lastCount = collected.size
      }
    }

    scrollContainer.scrollTop = 0
  }

  return {
    trades: [...collected.values()].sort((a, b) => b.tradeNumber - a.tradeNumber),
    strategy,
    instrument,
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "PING") {
    sendResponse({ ok: true, version: SCRAPER_VERSION })
    return true
  }

  if (message.type === "SCRAPE_TRADES") {
    sendResponse(scrapeVisibleTrades())
    return true
  }

  if (message.type === "IMPORT_ALL") {
    scrollAndCollectTrades().then(sendResponse)
    return true
  }

  return false
})
