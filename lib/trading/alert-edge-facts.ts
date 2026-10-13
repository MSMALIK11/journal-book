import {
  MIN_BUCKET_TRADES,
  type AnalyticsResult,
  type AvoidInsight,
  type BucketStats,
} from "@/lib/trading/analytics"

/** Below this, a win-rate headline is noise — the sentence has to hedge. */
const SOLID_SAMPLE_TRADES = 10

export type EdgeFact = {
  /** Hour bucket label, e.g. "16:00". */
  label: string
  kind: "best" | "worst"
  winRate: number
  trades: number
  wins: number
  netPnl: number
  /** Expectancy in R — null when the bucket has no usable R basis. */
  avgR: number | null
  confidence: "solid" | "thin"
  /** Speakable one-liner built from the numbers above. */
  sentence: string
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

/** R clause reads signed: "+1.2R average" / "−0.8R average". */
function describeR(avgR: number): string {
  return `${avgR >= 0 ? "+" : "−"}${Math.abs(avgR).toFixed(1)}R`
}

/**
 * `AvoidInsight` only carries winRate/trades/netPnl, so expectancy-R and the raw
 * win/loss split come from joining back to the hour buckets by key ("16").
 */
function joinHourBucket(
  analytics: AnalyticsResult,
  key: string,
): Pick<BucketStats, "wins" | "losses" | "avgR"> | null {
  const row = analytics.byHour.find((bucket) => bucket.key === key)
  if (!row) return null
  return { wins: row.wins, losses: row.losses, avgR: row.avgR ?? null }
}

function buildEdgeFact(
  insight: AvoidInsight,
  analytics: AnalyticsResult,
  kind: EdgeFact["kind"],
): EdgeFact | null {
  if (!finite(insight.winRate) || !finite(insight.netPnl)) return null
  if (insight.trades < MIN_BUCKET_TRADES) return null

  const bucket = joinHourBucket(analytics, insight.key)
  const avgR = bucket && finite(bucket.avgR) ? bucket.avgR : null
  // Ranking is win-rate driven, so fall back to the rate when the row is absent.
  const wins = bucket ? bucket.wins : Math.round((insight.winRate / 100) * insight.trades)
  const confidence: EdgeFact["confidence"] =
    insight.trades >= SOLID_SAMPLE_TRADES ? "solid" : "thin"

  return {
    label: insight.label,
    kind,
    winRate: insight.winRate,
    trades: insight.trades,
    wins,
    netPnl: insight.netPnl,
    avgR,
    confidence,
    sentence: composeEdgeSentence({
      label: insight.label,
      kind,
      winRate: insight.winRate,
      trades: insight.trades,
      wins,
      avgR,
      confidence,
    }),
  }
}

function composeEdgeSentence(input: {
  label: string
  kind: EdgeFact["kind"]
  winRate: number
  trades: number
  wins: number
  avgR: number | null
  confidence: EdgeFact["confidence"]
}): string {
  const { label, kind, winRate, trades, wins, avgR, confidence } = input
  const isBest = kind === "best"
  const rClause = avgR === null ? "" : `, ${describeR(avgR)} average`

  // Small samples get a counted phrasing instead of a confident percentage.
  if (confidence === "thin") {
    const losses = trades - wins
    return isBest
      ? `${label} looks strong so far — ${wins} of ${trades} trades won${rClause}.`
      : `${label} looks weak so far — ${losses} of ${trades} trades lost${rClause}.`
  }

  return isBest
    ? `${label} is your strongest hour — ${winRate.toFixed(0)}% wins across ${trades} trades${rClause}.`
    : `${label} is your weakest hour — only ${winRate.toFixed(0)}% wins across ${trades} trades${rClause}.`
}

/** Best hour for a specific insight row (used by the current-hour alert). */
export function hourEdgeFact(
  insight: AvoidInsight,
  analytics: AnalyticsResult,
  kind: "best" | "worst",
): EdgeFact | null {
  return buildEdgeFact(insight, analytics, kind)
}

/** Single strongest hour across the whole window — for digests and alert copy. */
export function topBestHourFact(analytics: AnalyticsResult): EdgeFact | null {
  const top = analytics.avoid.bestHours[0]
  return top ? buildEdgeFact(top, analytics, "best") : null
}

/** Single weakest hour across the whole window. */
export function topWorstHourFact(analytics: AnalyticsResult): EdgeFact | null {
  const top = analytics.avoid.hours[0]
  return top ? buildEdgeFact(top, analytics, "worst") : null
}

/** Compact digest line — keeps the existing digest style (short, parenthetical). */
export function digestBestHourLine(analytics: AnalyticsResult): string | null {
  const fact = topBestHourFact(analytics)
  if (!fact || fact.confidence === "thin") return null
  return `Best hour: ${fact.label} (${fact.winRate.toFixed(0)}% wins, ${fact.trades} trades).`
}

export function digestWorstHourLine(analytics: AnalyticsResult): string | null {
  const fact = topWorstHourFact(analytics)
  if (!fact || fact.confidence === "thin") return null
  return `Avoid hour: ${fact.label} (${fact.winRate.toFixed(0)}% wins, ${fact.trades} trades).`
}
