import { ASSET_TYPE_DEFAULTS, INSTRUMENTS, type AssetType } from "@/lib/instruments"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"
import type { AnalyticsTrade } from "@/lib/trading/analytics"
import { calculateRisk, calculateRR } from "@/lib/trading/calculator"

export type RMethod = "stop_loss" | "median_loss"

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

function resolveSpec(trade: FundedTrade) {
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
    instrument: resolveSpec(trade),
  })
  return calculateRR(trade.net_pnl, risk.amount)
}

function buildDistribution(rMultiples: number[]) {
  const definitions = [
    { bucket: "< -2R", min: Number.NEGATIVE_INFINITY, max: -2 },
    { bucket: "-2R to -1R", min: -2, max: -1 },
    { bucket: "-1R to 0R", min: -1, max: 0 },
    { bucket: "0R to 1R", min: 0, max: 1 },
    { bucket: "1R to 2R", min: 1, max: 2 },
    { bucket: "2R to 3R", min: 2, max: 3 },
    { bucket: "> 3R", min: 3, max: Number.POSITIVE_INFINITY },
  ]

  return definitions.map((def) => ({
    bucket: def.bucket,
    count: rMultiples.filter((value) => {
      if (def.min === Number.NEGATIVE_INFINITY) return value < def.max
      if (def.max === Number.POSITIVE_INFINITY) return value >= def.min
      return value >= def.min && value < def.max
    }).length,
  }))
}

export function computeRMultipleStats(trades: FundedTrade[]): RMultipleStats {
  const closed = trades.filter((trade): trade is FundedTrade & { net_pnl: number } => typeof trade.net_pnl === "number")
  const slValues = closed
    .map((trade) => stopLossR(trade))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))

  const losses = closed.filter((trade) => trade.net_pnl < 0).map((trade) => Math.abs(trade.net_pnl))
  const medianLoss = median(losses)
  const fallback = closed
    .map((trade) => (medianLoss > 0 ? trade.net_pnl / medianLoss : 0))
    .filter((value) => Number.isFinite(value))

  const method: RMethod = slValues.length >= STOP_LOSS_MIN_TRADES ? "stop_loss" : "median_loss"
  const rMultiples = method === "stop_loss" ? slValues : fallback

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
    stopLossSampleSize: slValues.length,
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
