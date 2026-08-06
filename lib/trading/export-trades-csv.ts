import { buildCsv } from "@/lib/export-csv"

export const TRADE_CSV_HEADERS = [
  "Account ID",
  "Instrument",
  "Direction",
  "Strategy",
  "Signal",
  "Entry Date",
  "Entry Price",
  "Exit Date",
  "Exit Price",
  "Quantity",
  "Net P&L",
  "Return %",
  "Commission",
  "External ID",
] as const

export type TradeCsvSource = {
  accountId?: string
  instrument: string
  trade_type: "Buy" | "Sell" | string
  strategy?: string | null
  signal?: string | null
  entry_date: Date | string
  entry_price: number
  exit_date?: Date | string | null
  exit_price?: number | null
  quantity: number
  net_pnl?: number | null
  return_pct?: number | null
  commission?: number | null
  external_id?: string | null
}

function formatTradeDate(value: Date | string | null | undefined) {
  if (!value) return ""
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString()
}

export function tradeToCsvRow(trade: TradeCsvSource) {
  return [
    trade.accountId ?? "",
    trade.instrument,
    trade.trade_type === "Buy" ? "Long" : "Short",
    trade.strategy ?? "",
    trade.signal ?? "",
    formatTradeDate(trade.entry_date),
    trade.entry_price,
    formatTradeDate(trade.exit_date),
    trade.exit_price ?? "",
    trade.quantity,
    trade.net_pnl ?? "",
    trade.return_pct ?? "",
    trade.commission ?? "",
    trade.external_id ?? "",
  ]
}

export function buildTradesCsv(trades: TradeCsvSource[]) {
  return buildCsv([...TRADE_CSV_HEADERS], trades.map(tradeToCsvRow))
}

export function dayKeyInTimezone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(date)
}

/** YYYY-MM in the user's timezone */
export function monthKeyInTimezone(date: Date, timezone: string) {
  return dayKeyInTimezone(date, timezone).slice(0, 7)
}

export function timeInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date)

  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  return `${hour}:${minute}`
}

function addCalendarDays(dayKey: string, days: number) {
  const [year, month, day] = dayKey.split("-").map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, "0")
  const d = String(next.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** True when `date` is the last calendar day of its month in `timezone`. */
export function isLastDayOfMonthInTimezone(date: Date, timezone: string) {
  const today = dayKeyInTimezone(date, timezone)
  const tomorrow = addCalendarDays(today, 1)
  return today.slice(0, 7) !== tomorrow.slice(0, 7)
}

export function filterTradesForDay<T extends { entry_date: Date | string }>(
  trades: T[],
  dayKey: string,
  timezone: string,
) {
  return trades.filter((trade) => {
    const entry = trade.entry_date instanceof Date ? trade.entry_date : new Date(trade.entry_date)
    return dayKeyInTimezone(entry, timezone) === dayKey
  })
}

export function filterTradesForMonth<T extends { entry_date: Date | string }>(
  trades: T[],
  monthKey: string,
  timezone: string,
) {
  return trades.filter((trade) => {
    const entry = trade.entry_date instanceof Date ? trade.entry_date : new Date(trade.entry_date)
    return monthKeyInTimezone(entry, timezone) === monthKey
  })
}

/** 2026-08-06 → 260806 */
export function dayKeyToYymmdd(dayKey: string) {
  const match = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dayKey.replace(/[^0-9]/g, "").slice(-6)
  return `${match[1].slice(2)}${match[2]}${match[3]}`
}

/** 2026-08 → 260831 (last calendar day of that month) */
export function monthKeyToYymmdd(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/)
  if (!match) return dayKeyToYymmdd(`${monthKey}-01`)
  const year = Number(match[1])
  const month = Number(match[2])
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${match[1].slice(2)}${match[2]}${String(lastDay).padStart(2, "0")}`
}

export function safeExportSymbol(symbol: string) {
  return symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 24) || "TRADES"
}

/** e.g. BTCUSDT_260806.csv / GOLD_260831.csv / BTCUSDT_260806_all.csv */
export function buildSymbolDateFileName(options: {
  symbol: string
  yymmdd: string
  scope?: "today" | "month" | "all"
}) {
  const sym = safeExportSymbol(options.symbol)
  const date = options.yymmdd.replace(/[^0-9]/g, "").slice(0, 6)
  if (options.scope === "all") return `${sym}_${date}_all.csv`
  return `${sym}_${date}.csv`
}
