import {
  computeAnalytics,
  type AnalyticsResult,
  type AnalyticsTrade,
} from "@/lib/trading/analytics"
import { resolveTradeSpec } from "@/lib/trading/r-multiples"
import { calculateRisk } from "@/lib/trading/calculator"

/** Cap on accounts swept in one portfolio request; beyond this the route truncates. */
export const PORTFOLIO_ACCOUNT_CAP = 8

export type PortfolioAccount = {
  id: string
  name: string
  initialCapital: number | null
}

export type PortfolioAccountRow = {
  accountId: string
  name: string
  initialCapital: number | null
  closedTrades: number
  netPnl: number
  winRate: number
  profitFactor: number | null
  expectancyR: number | null
  maxDrawdownPct: number
}

export type ExposureSummary = {
  /** Peak number of trades open at the same instant. */
  maxConcurrent: number
  /** 95th percentile (nearest-rank) of the concurrency trace. */
  p95Concurrent: number
  /** Fraction (0–1) of the observed span with at least one trade open. */
  pctTimeInTrade: number | null
  /** Peak simultaneous longs or shorts — a cheap proxy for correlated risk. */
  maxConcurrentSameDirection: number
  /** Peak sum of per-trade risk % held at once; null when no trade has a stop. */
  maxCapitalAtRiskPct: number | null
  longestSingleHoldMs: number | null
  /** Trades with a real entry and exit used in the sweep. */
  closedWithExit: number
  /** Trades skipped for exposure (open, or missing/unparsable dates). */
  ignored: number
}

export type PortfolioAnalytics = {
  merged: AnalyticsResult
  perAccount: PortfolioAccountRow[]
  exposure: ExposureSummary
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Risk % for one trade, or null when stop/size/balance are unusable. */
function tradeRiskPct(trade: AnalyticsTrade, fallbackCapital: number | null): number | null {
  const entry = Number(trade.entry_price)
  const stop = Number(trade.stop_loss)
  const size = Number(trade.quantity)
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || stop <= 0) return null
  const risk = calculateRisk({
    entryPrice: entry,
    stopLoss: stop,
    size: Number.isFinite(size) && size > 0 ? size : 1,
    instrument: resolveTradeSpec(trade),
  })
  if (risk.amount === null) return null
  const balance =
    typeof trade.account_balance === "number" && trade.account_balance > 0
      ? trade.account_balance
      : fallbackCapital
  if (!balance) return null
  return (risk.amount / balance) * 100
}

/**
 * Interval sweep over [entry, exit] of every closed trade to surface how much
 * risk runs at once. Trades without a usable exit are counted in `ignored`.
 */
export function computeExposure(
  trades: AnalyticsTrade[],
  accounts: PortfolioAccount[],
): ExposureSummary {
  const capitalById = new Map<string, number | null>()
  for (const a of accounts) capitalById.set(a.id, a.initialCapital)

  type Interval = { start: number; end: number; long: boolean; riskPct: number | null }
  const intervals: Interval[] = []
  let ignored = 0

  for (const trade of trades) {
    const entry = toDate(trade.entry_date)
    const exit = toDate(trade.exit_date)
    if (!entry || !exit || exit.getTime() < entry.getTime()) {
      ignored += 1
      continue
    }
    const fallbackCapital = trade.accountId ? capitalById.get(trade.accountId) ?? null : null
    intervals.push({
      start: entry.getTime(),
      end: exit.getTime(),
      long: trade.trade_type === "Buy",
      riskPct: tradeRiskPct(trade, fallbackCapital),
    })
  }

  if (!intervals.length) {
    return {
      maxConcurrent: 0,
      p95Concurrent: 0,
      pctTimeInTrade: null,
      maxConcurrentSameDirection: 0,
      maxCapitalAtRiskPct: null,
      longestSingleHoldMs: null,
      closedWithExit: 0,
      ignored,
    }
  }

  // starts sort before ends at equal timestamps so boundary overlap counts as concurrent.
  type Event = { at: number; kind: 1 | -1; idx: number }
  const events: Event[] = []
  intervals.forEach((iv, idx) => {
    events.push({ at: iv.start, kind: 1, idx })
    events.push({ at: iv.end, kind: -1, idx })
  })
  events.sort((a, b) => (a.at !== b.at ? a.at - b.at : b.kind - a.kind))

  let running = 0
  let longs = 0
  let shorts = 0
  let runningRisk = 0
  let anyRisk = false
  let maxConcurrent = 0
  let maxSameDir = 0
  let maxRiskAtOnce = 0
  const trace: number[] = []

  let spanStart = Infinity
  let spanEnd = -Infinity
  let prevAt = events[0]?.at ?? 0
  let activeMs = 0

  for (const ev of events) {
    if (running > 0) activeMs += ev.at - prevAt
    prevAt = ev.at
    spanStart = Math.min(spanStart, ev.at)
    spanEnd = Math.max(spanEnd, ev.at)

    const iv = intervals[ev.idx]
    if (ev.kind === 1) {
      running += 1
      if (iv.long) longs += 1
      else shorts += 1
      if (iv.riskPct != null) {
        runningRisk += iv.riskPct
        anyRisk = true
      }
    } else {
      running -= 1
      if (iv.long) longs -= 1
      else shorts -= 1
      if (iv.riskPct != null) runningRisk -= iv.riskPct
    }

    maxConcurrent = Math.max(maxConcurrent, running)
    maxSameDir = Math.max(maxSameDir, longs, shorts)
    if (anyRisk) maxRiskAtOnce = Math.max(maxRiskAtOnce, runningRisk)
    trace.push(running)
  }

  const span = spanEnd - spanStart
  const sortedTrace = [...trace].sort((a, b) => a - b)
  const p95Index = sortedTrace.length ? Math.ceil(0.95 * sortedTrace.length) - 1 : 0
  const longestSingleHoldMs = Math.max(
    0,
    ...intervals.map((iv) => iv.end - iv.start),
  )

  return {
    maxConcurrent,
    p95Concurrent: sortedTrace.length ? sortedTrace[Math.max(0, p95Index)] : 0,
    pctTimeInTrade: span > 0 ? activeMs / span : null,
    maxConcurrentSameDirection: maxSameDir,
    maxCapitalAtRiskPct: anyRisk ? Math.max(0, maxRiskAtOnce) : null,
    longestSingleHoldMs,
    closedWithExit: intervals.length,
    ignored,
  }
}

function toAccountRow(
  account: PortfolioAccount,
  result: AnalyticsResult,
): PortfolioAccountRow {
  return {
    accountId: account.id,
    name: account.name,
    initialCapital: account.initialCapital,
    closedTrades: result.overview.closedTrades,
    netPnl: result.overview.netPnl,
    winRate: result.overview.winRate,
    profitFactor: result.overview.profitFactor,
    expectancyR: result.overview.r?.expectancyR ?? null,
    maxDrawdownPct: result.overview.maxDrawdownPct,
  }
}

/**
 * Merge every account's trades into one reconciled result, then re-run per
 * account (with its own capital basis) so the UI can show the split. Cost is
 * `1 + k` computeAnalytics passes over `trades`.
 */
export function computePortfolioAnalytics(
  trades: AnalyticsTrade[],
  accounts: PortfolioAccount[],
  options: { timezone?: string } = {},
): PortfolioAnalytics {
  const timezone = options.timezone || "UTC"
  const merged = computeAnalytics(trades, { timezone })

  const byAccount = new Map<string, AnalyticsTrade[]>()
  for (const trade of trades) {
    const key = trade.accountId ?? ""
    const bucket = byAccount.get(key)
    if (bucket) bucket.push(trade)
    else byAccount.set(key, [trade])
  }

  const perAccount: PortfolioAccountRow[] = []
  for (const account of accounts) {
    const group = byAccount.get(account.id)
    if (!group || !group.length) continue
    const result = computeAnalytics(group, {
      timezone,
      initialCapital: account.initialCapital,
    })
    perAccount.push(toAccountRow(account, result))
  }

  return {
    merged,
    perAccount,
    exposure: computeExposure(trades, accounts),
  }
}
