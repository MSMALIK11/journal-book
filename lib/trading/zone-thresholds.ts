import { MIN_BUCKET_TRADES, type AvoidInsight, type BucketStats } from "@/lib/trading/analytics"

export const DEFAULT_RR_RATIO = 3
export const ZONE_YELLOW_MIN = 25
export const ZONE_GREEN_MIN = 50

export type ZoneThresholds = {
  breakevenWinRate: number
  yellowMin: number
  greenMin: number
  accountWinRate: number
}

export const DEFAULT_ZONE_THRESHOLDS: ZoneThresholds = {
  breakevenWinRate: ZONE_YELLOW_MIN,
  yellowMin: ZONE_YELLOW_MIN,
  greenMin: ZONE_GREEN_MIN,
  accountWinRate: 0,
}

export type TradeZone = "red" | "yellow" | "green" | "neutral"

export function breakevenWinRate(rrRatio = DEFAULT_RR_RATIO): number {
  return (1 / (1 + rrRatio)) * 100
}

export function computeZoneThresholds(
  overview: { winRate: number },
  rrRatio = DEFAULT_RR_RATIO,
): ZoneThresholds {
  const breakeven = breakevenWinRate(rrRatio)

  return {
    breakevenWinRate: breakeven,
    yellowMin: breakeven,
    greenMin: ZONE_GREEN_MIN,
    accountWinRate: overview.winRate,
  }
}

export function classifyZone(
  stats: { winRate: number; trades: number; netPnl?: number },
  thresholds: ZoneThresholds = DEFAULT_ZONE_THRESHOLDS,
): TradeZone {
  if (stats.trades < MIN_BUCKET_TRADES) return "neutral"

  if (stats.winRate < thresholds.yellowMin) return "red"
  if (typeof stats.netPnl === "number" && stats.netPnl < 0) return "red"

  if (stats.winRate >= thresholds.greenMin) {
    if (typeof stats.netPnl !== "number" || stats.netPnl > 0) return "green"
  }

  return "yellow"
}

function avoidReason(bucket: BucketStats, zone: TradeZone, thresholds: ZoneThresholds): string {
  if (zone === "red") {
    if (bucket.netPnl < 0 && bucket.winRate < thresholds.yellowMin) {
      return "Negative P&L and below break-even win rate"
    }
    if (bucket.netPnl < 0) return "Negative P&L"
    return `Win rate below ${thresholds.yellowMin.toFixed(0)}%`
  }
  return "Below strong-zone threshold with negative expectancy"
}

export function rankAvoidBuckets(
  buckets: BucketStats[],
  minTrades: number,
  thresholds: ZoneThresholds,
): AvoidInsight[] {
  return buckets
    .filter((b) => {
      if (b.trades < minTrades) return false
      const zone = classifyZone(b, thresholds)
      return zone === "red" || (zone === "yellow" && b.netPnl < 0)
    })
    .sort((a, b) => a.netPnl - b.netPnl)
    .map((b) => ({
      key: b.key,
      label: b.label,
      trades: b.trades,
      winRate: b.winRate,
      netPnl: b.netPnl,
      reason: avoidReason(b, classifyZone(b, thresholds), thresholds),
    }))
}

export function rankBestBuckets(buckets: BucketStats[], minTrades: number): AvoidInsight[] {
  return buckets
    .filter((b) => b.trades >= minTrades && b.netPnl > 0)
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 5)
    .map((b) => ({
      key: b.key,
      label: b.label,
      trades: b.trades,
      winRate: b.winRate,
      netPnl: b.netPnl,
      reason: "Strong positive expectancy",
    }))
}
