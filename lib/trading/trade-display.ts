import { classifySession, getSessionDef, getZonedParts, normalizeWeekday } from "@/lib/trading/sessions"

export type TradeLegInput = {
  entry_date: string
  exit_date?: string | null
  entry_price: number
  exit_price?: number | null
  trade_type: "Buy" | "Sell"
  net_pnl?: number | null
}

export type ResolvedTradeLegs = {
  entryDate: string
  exitDate?: string | null
  entryPrice: number
  exitPrice?: number | null
}

/** Long/Short label — clearer than Buy/Sell for synced trades. */
export function tradeSideLabel(tradeType: "Buy" | "Sell"): "Long" | "Short" {
  return tradeType === "Buy" ? "Long" : "Short"
}

const GENERIC_SYNC_STRATEGY = "TradingView Strategy"

/** Hide the default extension strategy label; show custom strategy names only. */
export function shouldShowStrategyLabel(strategy?: string | null): boolean {
  if (!strategy?.trim()) return false
  return strategy.trim() !== GENERIC_SYNC_STRATEGY
}

export function getTradeSessionLabel(
  entryDate: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const parsed = new Date(entryDate)
  if (Number.isNaN(parsed.getTime())) return "—"
  const { hour, minute } = getZonedParts(parsed, timezone)
  const session = classifySession(hour, minute)
  return getSessionDef(session).label
}

export function formatTradeStartTime(
  entryDate: string,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string | null {
  const parsed = new Date(entryDate)
  if (Number.isNaN(parsed.getTime())) return null
  const { hour, minute } = getZonedParts(parsed, timezone)
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export type TradeWindowFlags = {
  weakHour: boolean
  weakSession: boolean
  weakDay: boolean
}

type AvoidKeyLists = {
  hours: Array<{ key: string }>
  sessions: Array<{ key: string }>
  days: Array<{ key: string }>
}

/** Whether a trade was opened in a historically weak hour, session, or weekday. */
export function getTradeWindowFlags(
  entryDate: string,
  avoid: AvoidKeyLists | null | undefined,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): TradeWindowFlags {
  const empty = { weakHour: false, weakSession: false, weakDay: false }
  if (!avoid) return empty

  const parsed = new Date(entryDate)
  if (Number.isNaN(parsed.getTime())) return empty

  const { hour, minute, weekday } = getZonedParts(parsed, timezone)
  const session = classifySession(hour, minute)
  const weekdayKey = normalizeWeekday(weekday)

  return {
    weakHour: avoid.hours.some((item) => item.key === String(hour)),
    weakSession: avoid.sessions.some((item) => item.key === session),
    weakDay: avoid.days.some((item) => item.key === weekdayKey),
  }
}

/**
 * Ensures entry → exit order matches chronological open → close and PnL direction.
 * Fixes legacy rows where dates were normalized but prices were left swapped.
 */
export function resolveTradeLegs(trade: TradeLegInput): ResolvedTradeLegs {
  let entryDate = trade.entry_date
  let exitDate = trade.exit_date ?? null
  let entryPrice = trade.entry_price
  let exitPrice = trade.exit_price ?? null

  if (exitDate && exitPrice != null) {
    const entryMs = new Date(entryDate).getTime()
    const exitMs = new Date(exitDate).getTime()

    if (Number.isFinite(entryMs) && Number.isFinite(exitMs) && entryMs > exitMs) {
      ;[entryDate, exitDate] = [exitDate, entryDate]
      ;[entryPrice, exitPrice] = [exitPrice, entryPrice]
    }

    const pnl = trade.net_pnl
    if (typeof pnl === "number" && Math.abs(pnl) > 0.0001 && exitPrice != null) {
      const isLong = trade.trade_type === "Buy"
      const priceDelta = exitPrice - entryPrice
      if (Math.abs(priceDelta) > 0.0001) {
        const priceImpliesProfit = isLong ? priceDelta > 0 : priceDelta < 0
        const pnlIsProfit = pnl > 0
        if (priceImpliesProfit !== pnlIsProfit) {
          ;[entryPrice, exitPrice] = [exitPrice, entryPrice]
        }
      }
    }
  }

  return { entryDate, exitDate, entryPrice, exitPrice }
}

export function formatTradePriceRange(
  trade: TradeLegInput,
  formatPrice: (value: number) => string,
): string {
  const { entryPrice, exitPrice } = resolveTradeLegs(trade)
  if (exitPrice == null) return formatPrice(entryPrice)
  return `${formatPrice(entryPrice)} → ${formatPrice(exitPrice)}`
}
