import { computeAnalytics, MIN_BUCKET_TRADES, type AnalyticsTrade } from "@/lib/trading/analytics"
import { classifySession, getZonedParts, normalizeWeekday } from "@/lib/trading/sessions"
import { classifyZone, computeZoneThresholds } from "@/lib/trading/zone-thresholds"

type ImpactTrade = AnalyticsTrade & { net_pnl: number }

export type PerformanceSnapshot = {
  trades: number
  netPnl: number
  winRate: number
  profitFactor: number | null
  wins: number
  losses: number
}

export type AvoidanceScenario = {
  id: string
  title: string
  description: string
  tradesRemoved: number
  tradesKept: number
  removedPnl: number
  actual: PerformanceSnapshot
  optimized: PerformanceSnapshot
  delta: {
    netPnl: number
    winRate: number
    profitFactor: number | null
  }
}

export type MistakeBucket = {
  dimension: "hour" | "session" | "weekday"
  label: string
  trades: number
  netPnl: number
  winRate: number
  zone: "red" | "yellow"
}

export type AvoidanceImpact = {
  scenarios: AvoidanceScenario[]
  mistakes: MistakeBucket[]
  summary: string
}

type ClosedTrade = ImpactTrade

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function computePerformance(trades: ClosedTrade[]): PerformanceSnapshot {
  const wins = trades.filter((t) => t.net_pnl > 0)
  const losses = trades.filter((t) => t.net_pnl < 0)
  const grossProfit = wins.reduce((sum, t) => sum + t.net_pnl, 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.net_pnl, 0))
  const netPnl = trades.reduce((sum, t) => sum + t.net_pnl, 0)

  return {
    trades: trades.length,
    netPnl,
    winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor:
      grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : grossLoss > 0 ? 0 : null,
    wins: wins.length,
    losses: losses.length,
  }
}

function isAvoidBucket(
  stats: { winRate: number; trades: number; netPnl: number },
  thresholds: ReturnType<typeof computeZoneThresholds>,
): boolean {
  if (stats.trades < MIN_BUCKET_TRADES) return false
  const zone = classifyZone(stats, thresholds)
  return zone === "red" || (zone === "yellow" && stats.netPnl < 0)
}

function buildMistakeList(
  analytics: ReturnType<typeof computeAnalytics>,
  thresholds: ReturnType<typeof computeZoneThresholds>,
): MistakeBucket[] {
  const mistakes: MistakeBucket[] = []

  for (const bucket of analytics.byHour) {
    if (!isAvoidBucket(bucket, thresholds)) continue
    const zone = classifyZone(bucket, thresholds)
    mistakes.push({
      dimension: "hour",
      label: bucket.label,
      trades: bucket.trades,
      netPnl: bucket.netPnl,
      winRate: bucket.winRate,
      zone: zone === "red" ? "red" : "yellow",
    })
  }

  for (const bucket of analytics.bySession) {
    if (!isAvoidBucket(bucket, thresholds)) continue
    const zone = classifyZone(bucket, thresholds)
    mistakes.push({
      dimension: "session",
      label: bucket.label,
      trades: bucket.trades,
      netPnl: bucket.netPnl,
      winRate: bucket.winRate,
      zone: zone === "red" ? "red" : "yellow",
    })
  }

  for (const bucket of analytics.byWeekday) {
    if (!isAvoidBucket(bucket, thresholds)) continue
    const zone = classifyZone(bucket, thresholds)
    mistakes.push({
      dimension: "weekday",
      label: bucket.label,
      trades: bucket.trades,
      netPnl: bucket.netPnl,
      winRate: bucket.winRate,
      zone: zone === "red" ? "red" : "yellow",
    })
  }

  return mistakes.sort((a, b) => a.netPnl - b.netPnl)
}

function tagTrade(
  trade: ClosedTrade,
  timezone: string,
  analytics: ReturnType<typeof computeAnalytics>,
  thresholds: ReturnType<typeof computeZoneThresholds>,
): Set<"hour" | "session" | "weekday"> {
  const tags = new Set<"hour" | "session" | "weekday">()
  const entry = toDate(trade.entry_date)
  if (!entry) return tags

  const { hour, minute, weekday } = getZonedParts(entry, timezone)
  const weekdayKey = normalizeWeekday(weekday)
  const sessionKey = classifySession(hour, minute)

  const hourBucket = analytics.byHour.find((b) => b.key === String(hour))
  if (hourBucket && isAvoidBucket(hourBucket, thresholds)) tags.add("hour")

  const sessionBucket = analytics.bySession.find((b) => b.key === sessionKey)
  if (sessionBucket && isAvoidBucket(sessionBucket, thresholds)) tags.add("session")

  const weekdayBucket = analytics.byWeekday.find((b) => b.key === weekdayKey)
  if (weekdayBucket && isAvoidBucket(weekdayBucket, thresholds)) tags.add("weekday")

  return tags
}

function buildScenario(
  id: string,
  title: string,
  description: string,
  all: ClosedTrade[],
  removedSet: Set<ClosedTrade>,
): AvoidanceScenario {
  const kept = all.filter((t) => !removedSet.has(t))
  const removed = all.filter((t) => removedSet.has(t))
  const actual = computePerformance(all)
  const optimized = computePerformance(kept)
  const removedPnl = removed.reduce((sum, t) => sum + t.net_pnl, 0)

  const pfDelta =
    actual.profitFactor != null && optimized.profitFactor != null
      ? optimized.profitFactor - actual.profitFactor
      : null

  return {
    id,
    title,
    description,
    tradesRemoved: removed.length,
    tradesKept: kept.length,
    removedPnl,
    actual,
    optimized,
    delta: {
      netPnl: optimized.netPnl - actual.netPnl,
      winRate: optimized.winRate - actual.winRate,
      profitFactor: pfDelta,
    },
  }
}

export function computeAvoidanceImpact(
  trades: AnalyticsTrade[],
  options: { timezone?: string } = {},
): AvoidanceImpact | null {
  const closed = trades.filter((t): t is ClosedTrade => typeof t.net_pnl === "number")
  if (closed.length < MIN_BUCKET_TRADES) return null

  const timezone = options.timezone || "UTC"
  const analytics = computeAnalytics(closed, { timezone })
  const thresholds = computeZoneThresholds({ winRate: analytics.overview.winRate })
  const mistakes = buildMistakeList(analytics, thresholds)

  if (!mistakes.length) {
    return {
      scenarios: [],
      mistakes: [],
      summary: "No clear weak hours, sessions, or weekdays in your data yet — keep logging trades.",
    }
  }

  const tagged = closed.map((trade) => ({
    trade,
    tags: tagTrade(trade, timezone, analytics, thresholds),
  }))

  const weakHourTrades = tagged.filter((t) => t.tags.has("hour")).map((t) => t.trade)
  const weakSessionTrades = tagged.filter((t) => t.tags.has("session")).map((t) => t.trade)
  const weakWeekdayTrades = tagged.filter((t) => t.tags.has("weekday")).map((t) => t.trade)
  const anyWeakTrades = tagged.filter((t) => t.tags.size > 0).map((t) => t.trade)

  const scenarios: AvoidanceScenario[] = []

  if (weakHourTrades.length > 0) {
    scenarios.push(
      buildScenario(
        "avoid_hours",
        "Skip weak hours",
        "If you had not traded during your historically weak hours.",
        closed,
        new Set(weakHourTrades),
      ),
    )
  }

  if (weakSessionTrades.length > 0) {
    scenarios.push(
      buildScenario(
        "avoid_sessions",
        "Skip weak sessions",
        "If you had avoided your weakest session windows.",
        closed,
        new Set(weakSessionTrades),
      ),
    )
  }

  if (weakWeekdayTrades.length > 0) {
    scenarios.push(
      buildScenario(
        "avoid_weekdays",
        "Skip weak weekdays",
        "If you had sat out on your worst weekdays.",
        closed,
        new Set(weakWeekdayTrades),
      ),
    )
  }

  if (anyWeakTrades.length > 0) {
    scenarios.push(
      buildScenario(
        "avoid_all",
        "Skip all weak windows",
        "If you only traded outside every weak hour, session, and weekday.",
        closed,
        new Set(anyWeakTrades),
      ),
    )
  }

  const best = [...scenarios].sort((a, b) => b.delta.netPnl - a.delta.netPnl)[0]
  const summary = best
    ? `Avoiding ${best.tradesRemoved} trades in weak windows could have improved net P&L by ${formatCurrency(Math.abs(best.delta.netPnl))} and win rate by ${best.delta.winRate.toFixed(1)} pts.`
    : "Keep building sample size to unlock what-if scenarios."

  return { scenarios, mistakes, summary }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

export function mistakeDimensionLabel(dimension: MistakeBucket["dimension"]) {
  switch (dimension) {
    case "hour":
      return "Hour"
    case "session":
      return "Session"
    case "weekday":
      return "Weekday"
  }
}
