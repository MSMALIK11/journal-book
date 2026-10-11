import { ASSET_TYPE_DEFAULTS, INSTRUMENTS, type AssetType } from "@/lib/instruments"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"
import type { AnalyticsTrade } from "@/lib/trading/analytics"
import { calculateRisk, calculateRR } from "@/lib/trading/calculator"

export type RMethod = "challenge_r" | "stop_loss" | "median_loss"

export type FundedTrade = AnalyticsTrade & {
  entry_price?: number | null
  stop_loss?: number | null
  target?: number | null
  quantity?: number | null
  asset_type?: AssetType | string | null
}

export type RMultipleStats = {
  method: RMethod
  sampleSize: number
  stopLossSampleSize: number
  rMultiples: number[]
  avgWinR: number
  avgLossR: number
  expectancyR: number
  avgRrRatio: number | null
  winRate: number
  lossRate: number
  distribution: { bucket: string; count: number }[]
}

const STOP_LOSS_MIN_TRADES = 20

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function mean(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function resolveTradeSpec(trade: FundedTrade) {
  const symbol = canonicalInstrumentSymbol(String(trade.instrument || ""))
  const configured = INSTRUMENTS[symbol]
  if (configured) return configured
  const assetType = (trade.asset_type as AssetType) || "crypto"
  return {
    symbol: symbol || "UNKNOWN",
    name: symbol || "Unknown",
    isDefault: true,
    ...ASSET_TYPE_DEFAULTS[assetType],
  }
}

function stopLossR(trade: FundedTrade): number | null {
  if (typeof trade.net_pnl !== "number") return null
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
  return calculateRR(trade.net_pnl, risk.amount)
}

export type ClosedFundedTrade = FundedTrade & { net_pnl: number }

export type RMultipleSample = {
  method: RMethod
  /** Same order and length as the trades passed in; null where R cannot be resolved. */
  values: (number | null)[]
  stopLossSampleSize: number
  medianLoss: number
}

/**
 * Split the R basis decision from the aggregation so callers can keep R aligned
 * with their own trade order (analytics buckets) while funded-roadmap stays identical.
 */
export function toRMultiples(closed: ClosedFundedTrade[]): RMultipleSample {
  const stopLossValues = closed.map((trade) => {
    const value = stopLossR(trade)
    return value !== null && Number.isFinite(value) ? value : null
  })
  const stopLossSampleSize = stopLossValues.filter((value) => value !== null).length
  const medianLoss = median(
    closed.filter((trade) => trade.net_pnl < 0).map((trade) => Math.abs(trade.net_pnl)),
  )
  const method: RMethod = stopLossSampleSize >= STOP_LOSS_MIN_TRADES ? "stop_loss" : "median_loss"
  const values =
    method === "stop_loss"
      ? stopLossValues
      : closed.map((trade) => (medianLoss > 0 ? trade.net_pnl / medianLoss : 0))

  return { method, values, stopLossSampleSize, medianLoss }
}

export function summarizeRMultiples(sample: RMultipleSample): RMultipleStats {
  return aggregateR(
    sample.method,
    sample.values.filter((value): value is number => value !== null),
    sample.stopLossSampleSize,
  )
}

/** Open-ended bounds live only in this module — Infinity would not survive JSON. */
export const R_BUCKET_DEFINITIONS = [
  { bucket: "< -2R", min: Number.NEGATIVE_INFINITY, max: -2 },
  { bucket: "-2R to -1R", min: -2, max: -1 },
  { bucket: "-1R to 0R", min: -1, max: 0 },
  { bucket: "0R to 1R", min: 0, max: 1 },
  { bucket: "1R to 2R", min: 1, max: 2 },
  { bucket: "2R to 3R", min: 2, max: 3 },
  { bucket: "> 3R", min: 3, max: Number.POSITIVE_INFINITY },
]

export function rBucketIndex(value: number): number {
  if (value < -2) return 0
  if (value < -1) return 1
  if (value < 0) return 2
  if (value < 1) return 3
  if (value < 2) return 4
  if (value < 3) return 5
  return 6
}

export function buildDistribution(rMultiples: number[]) {
  const counts = R_BUCKET_DEFINITIONS.map(() => 0)
  for (const value of rMultiples) counts[rBucketIndex(value)] += 1
  return R_BUCKET_DEFINITIONS.map((def, index) => ({ bucket: def.bucket, count: counts[index] }))
}

function aggregateR(
  method: RMethod,
  rMultiples: number[],
  stopLossSampleSize: number,
): RMultipleStats {
  const wins = rMultiples.filter((value) => value > 0)
  const losing = rMultiples.filter((value) => value < 0)
  const n = rMultiples.length
  const winRate = n ? wins.length / n : 0
  const lossRate = n ? losing.length / n : 0
  const avgWinR = mean(wins)
  const avgLossR = mean(losing)
  const expectancyR = n ? winRate * avgWinR + lossRate * avgLossR : 0
  const avgRrRatio = avgLossR < 0 ? Math.abs(avgWinR / avgLossR) : null

  return {
    method,
    sampleSize: n,
    stopLossSampleSize,
    rMultiples,
    avgWinR,
    avgLossR,
    expectancyR,
    avgRrRatio,
    winRate,
    lossRate,
    distribution: buildDistribution(rMultiples),
  }
}

/** Map closed-trade P&L to R using the funded challenge's planned 1R (risk $). */
export function computeChallengeRStats(trades: FundedTrade[], oneR: number): RMultipleStats {
  if (!(oneR > 0)) return aggregateR("challenge_r", [], 0)

  const rMultiples = trades
    .filter((trade): trade is FundedTrade & { net_pnl: number } => typeof trade.net_pnl === "number")
    .map((trade) => trade.net_pnl / oneR)
    .filter((value) => Number.isFinite(value))

  return aggregateR("challenge_r", rMultiples, 0)
}

export function computeRMultipleStats(trades: FundedTrade[]): RMultipleStats {
  return summarizeRMultiples(
    toRMultiples(
      trades.filter(
        (trade): trade is FundedTrade & { net_pnl: number } => typeof trade.net_pnl === "number",
      ),
    ),
  )
}
