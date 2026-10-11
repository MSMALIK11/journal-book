import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns"
import Trade from "@/app/api/models/Trade"
import { localDayEndUtc, localDayStartUtc, shiftDayKey } from "@/lib/trading/sessions"

export type TradeQueryParams = {
  source: string
  strategy: string | null
  instrument: string | null
  startDate: string | null
  endDate: string | null
}

export type TradeQueryOptions = {
  /** Treat yyyy-MM-dd bounds as calendar days in this timezone instead of UTC. */
  timezone?: string
  /** Widen the lower bound so trades that closed inside the window are fetched. */
  exitAttributionLookbackDays?: number
  /** Spread scope across several accounts in one query. */
  accountIds?: string[]
}

export const ANALYTICS_TRADE_SELECT =
  "entry_date exit_date entry_price exit_price net_pnl return_pct commission strategy instrument trade_type signal source stop_loss target quantity asset_type account_balance accountId"

export const RESEARCH_TRADE_SELECT =
  "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source emotion_tag confidence_rating followed_plan mistake_tag tags stop_loss target quantity"

export const FUNDED_TRADE_SELECT =
  "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source entry_price stop_loss target quantity asset_type"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** How far back an exit-date window has to reach on the indexed entry_date bound. */
export const EXIT_ATTRIBUTION_LOOKBACK_DAYS = 180

/** Ceiling on a single analytics fetch; above this the payload is flagged truncated. */
export const TRADE_FETCH_LIMIT = 10_000

export function validateDateRange(startDate: string | null, endDate: string | null) {
  if ((startDate && !DATE_PATTERN.test(startDate)) || (endDate && !DATE_PATTERN.test(endDate))) {
    return "Invalid calendar date range"
  }
  if (startDate && endDate && startDate > endDate) {
    return "Start date must be on or before the end date"
  }
  return null
}

export function buildTradeQuery(
  sessionSub: string,
  accountId: string,
  params: TradeQueryParams,
  options: TradeQueryOptions = {},
) {
  const query: Record<string, unknown> = {
    userId: sessionSub,
    accountId: options.accountIds?.length ? { $in: options.accountIds } : accountId,
    net_pnl: { $exists: true, $ne: null },
  }

  if (params.source === "tradingview" || params.source === "manual") {
    query.source = params.source
  }

  if (params.strategy && params.strategy !== "all") query.strategy = params.strategy
  if (params.instrument && params.instrument !== "all") query.instrument = params.instrument

  if (params.startDate || params.endDate) {
    query.entry_date = {}
    const bounds = query.entry_date as Record<string, Date>
    if (params.startDate) {
      bounds.$gte = zonedLowerBound(
        params.startDate,
        options.timezone,
        options.exitAttributionLookbackDays ?? 0,
      )
    }
    if (params.endDate) {
      bounds.$lte = zonedUpperBound(params.endDate, options.timezone)
    }
  }

  return query
}

function zonedLowerBound(startDate: string, timezone: string | undefined, lookbackDays: number): Date {
  if (!timezone) return new Date(`${startDate}T00:00:00.000Z`)
  const fromKey = lookbackDays > 0 ? shiftDayKey(startDate, -lookbackDays) ?? startDate : startDate
  return localDayStartUtc(fromKey, timezone) ?? new Date(`${fromKey}T00:00:00.000Z`)
}

function zonedUpperBound(endDate: string, timezone: string | undefined): Date {
  if (!timezone) return new Date(`${endDate}T23:59:59.999Z`)
  const exclusiveEnd = localDayEndUtc(endDate, timezone)
  if (!exclusiveEnd) return new Date(`${endDate}T23:59:59.999Z`)
  return new Date(exclusiveEnd.getTime() - 1)
}

export function previousPeriodDates(startDate: string, endDate: string) {
  const start = parseISO(startDate)
  const end = parseISO(endDate)
  const days = differenceInCalendarDays(end, start) + 1
  const prevEnd = subDays(start, 1)
  const prevStart = subDays(prevEnd, days - 1)
  return {
    startDate: format(prevStart, "yyyy-MM-dd"),
    endDate: format(prevEnd, "yyyy-MM-dd"),
    label: `previous ${days} day${days === 1 ? "" : "s"}`,
  }
}

export async function fetchClosedTrades(query: Record<string, unknown>, select: string) {
  return Trade.find(query).select(select).sort({ entry_date: 1 }).limit(10000).lean()
}

/** Same as fetchClosedTrades, but reports whether the ceiling cut rows off. */
export async function fetchClosedTradesWithMeta(
  query: Record<string, unknown>,
  select: string,
  limit: number = TRADE_FETCH_LIMIT,
) {
  // Fetch one extra row so an exact-multiple result is not mistaken for truncation.
  const rows = await Trade.find(query).select(select).sort({ entry_date: 1 }).limit(limit + 1).lean()
  const truncated = rows.length > limit
  return {
    trades: truncated ? rows.slice(0, limit) : rows,
    meta: { truncated, fetched: truncated ? limit : rows.length, limit },
  }
}
