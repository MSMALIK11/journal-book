import { differenceInCalendarDays, format, parseISO, subDays } from "date-fns"
import Trade from "@/app/api/models/Trade"

export type TradeQueryParams = {
  source: string
  strategy: string | null
  instrument: string | null
  startDate: string | null
  endDate: string | null
}

export const ANALYTICS_TRADE_SELECT =
  "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source"

export const RESEARCH_TRADE_SELECT =
  "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source emotion_tag confidence_rating followed_plan mistake_tag tags stop_loss target quantity"

export const FUNDED_TRADE_SELECT =
  "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source entry_price stop_loss target quantity asset_type"

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function validateDateRange(startDate: string | null, endDate: string | null) {
  if ((startDate && !DATE_PATTERN.test(startDate)) || (endDate && !DATE_PATTERN.test(endDate))) {
    return "Invalid calendar date range"
  }
  return null
}

export function buildTradeQuery(
  sessionSub: string,
  accountId: string,
  params: TradeQueryParams,
) {
  const query: Record<string, unknown> = {
    userId: sessionSub,
    accountId,
    net_pnl: { $exists: true, $ne: null },
  }

  if (params.source === "tradingview" || params.source === "manual") {
    query.source = params.source
  }

  if (params.strategy && params.strategy !== "all") query.strategy = params.strategy
  if (params.instrument && params.instrument !== "all") query.instrument = params.instrument

  if (params.startDate || params.endDate) {
    query.entry_date = {}
    if (params.startDate) {
      ;(query.entry_date as Record<string, Date>).$gte = new Date(`${params.startDate}T00:00:00.000Z`)
    }
    if (params.endDate) {
      ;(query.entry_date as Record<string, Date>).$lte = new Date(`${params.endDate}T23:59:59.999Z`)
    }
  }

  return query
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
