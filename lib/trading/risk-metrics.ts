import type { EquityPoint } from "@/lib/trading/analytics"

/** Sharpe/Sortino on a per-day return series. Basis label keeps dollar-vs-% honest. */
export type RiskRatios = {
  sharpe: number | null
  sortino: number | null
  calmar: number | null
  ulcer: number | null
  basis: "capital_pct" | "dollar" | null
  sampleDays: number
}

export type SignificanceSummary = {
  tStat: number | null
  significant: boolean
  /** Wilson 95% interval on the win rate, as fractions (0–1). */
  winRateCi: [number, number] | null
  /** Full Kelly fraction (0–1); negative means the edge is not positive. */
  kelly: number | null
  halfKelly: number | null
}

export type RollingEdgePoint = {
  endExitDate: string
  label: string
  avgR: number | null
  expectancyR: number | null
  winRate: number
  trades: number
}

const TRADING_DAYS_PER_YEAR = 252
/** Below this the dispersion is floating-point noise, not a real signal. */
const MIN_STDEV = 1e-12

function stdev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/**
 * Daily returns from the equity curve. When initial capital is known we divide the
 * day's P&L by capital (a return on capital); otherwise we keep raw dollar deltas.
 */
export function dailyReturnsFromEquity(
  equityCurve: EquityPoint[],
  initialCapital: number | null,
): { returns: number[]; basis: "capital_pct" | "dollar" } {
  if (equityCurve.length < 2) return { returns: [], basis: "capital_pct" }
  const basis = initialCapital && initialCapital > 0 ? "capital_pct" : "dollar"
  const returns: number[] = []
  for (let i = 1; i < equityCurve.length; i++) {
    const delta = equityCurve[i].equity - equityCurve[i - 1].equity
    if (basis === "capital_pct") returns.push(delta / (initialCapital as number))
    else returns.push(delta)
  }
  return { returns, basis }
}

export function sharpe(returns: number[]): number | null {
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const sd = stdev(returns, mean)
  if (sd < MIN_STDEV) return null
  return (mean / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

export function sortino(returns: number[]): number | null {
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const downside = returns.filter((r) => r < 0)
  if (downside.length < 2) return null
  const dMean = downside.reduce((s, r) => s + r, 0) / downside.length
  const dsd = stdev(downside, dMean)
  if (dsd < MIN_STDEV) return null
  return (mean / dsd) * Math.sqrt(TRADING_DAYS_PER_YEAR)
}

export function calmar(netPnl: number, maxDrawdown: number): number | null {
  if (maxDrawdown <= 0) return null
  return netPnl / maxDrawdown
}

/** Ulcer index: RMS of the percentage-depth drawdown series. */
export function ulcer(equityCurve: EquityPoint[]): number | null {
  if (equityCurve.length < 2) return null
  const sumSq = equityCurve.reduce((s, p) => s + p.drawdownPct ** 2, 0)
  return Math.sqrt(sumSq / equityCurve.length)
}

/** Two-proportion z-test-style t statistic on the mean per-trade outcome. */
export function tStat(values: number[]): number | null {
  if (values.length < 2) return null
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const sd = stdev(values, mean)
  if (sd < MIN_STDEV) return null
  return mean / (sd / Math.sqrt(values.length))
}

/** Wilson score interval for a binomial proportion at 95%. */
export function wilsonInterval(wins: number, total: number): [number, number] | null {
  if (total <= 0) return null
  const z = 1.96
  const phat = wins / total
  const denom = 1 + (z * z) / total
  const center = (phat + (z * z) / (2 * total)) / denom
  const margin =
    (z * Math.sqrt((phat * (1 - phat)) / total + (z * z) / (4 * total * total))) / denom
  return [Math.max(0, center - margin), Math.min(1, center + margin)]
}

/** Kelly fraction from win rate and average win/loss in R (or currency). */
export function kellyFraction(winRate: number, avgWin: number, avgLoss: number): number | null {
  if (!(avgWin > 0) || !(avgLoss > 0)) return null
  const lossRate = 1 - winRate
  const b = avgWin / avgLoss
  const f = winRate - lossRate / b
  if (!Number.isFinite(f)) return null
  return Math.max(0, Math.min(1, f))
}

/**
 * Rolling expectancy in R over a fixed number of trades. Windows are taken on the
 * exit-ordered R sample; downsampled to at most `maxPoints` for a bounded payload.
 */
export function rollingEdge(
  orderedR: (number | null)[],
  orderedDates: string[],
  windowSize = 20,
  maxPoints = 60,
): RollingEdgePoint[] {
  const points: RollingEdgePoint[] = []
  if (orderedR.length < windowSize) return points
  for (let i = windowSize - 1; i < orderedR.length; i++) {
    const slice = orderedR.slice(i - windowSize + 1, i + 1)
    const values = slice.filter((v): v is number => v !== null)
    if (!values.length) continue
    const wins = values.filter((v) => v > 0).length
    const avg = values.reduce((s, v) => s + v, 0) / values.length
    points.push({
      endExitDate: orderedDates[i],
      label: orderedDates[i],
      avgR: avg,
      expectancyR: avg,
      winRate: (wins / values.length) * 100,
      trades: values.length,
    })
  }
  if (points.length <= maxPoints) return points
  const step = Math.ceil(points.length / maxPoints)
  const sampled: RollingEdgePoint[] = []
  for (let i = 0; i < points.length; i += step) sampled.push(points[i])
  const last = points[points.length - 1]
  if (sampled[sampled.length - 1] !== last) sampled.push(last)
  return sampled
}
