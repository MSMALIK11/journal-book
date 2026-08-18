import type { AnalyticsResult, AnalyticsTrade } from "@/lib/trading/analytics"
import {
  FUNDED_ACCOUNT_LADDER,
  RISK_COMPARISON_PERCENTS,
  formatAccountSize,
  type FundedAccountLevel,
  type FundedChallengeRules,
  type RiskMode,
} from "@/lib/trading/funded-presets"
import { histogram, runMonteCarlo, type MonteCarloResult } from "@/lib/trading/monte-carlo"
import type { FundedTrade, RMultipleStats } from "@/lib/trading/r-multiples"
import {
  classifySession,
  getZonedParts,
  normalizeWeekday,
  type TradingSession,
} from "@/lib/trading/sessions"

export type DirectionFilter = "all" | "long" | "short"
export type SessionFilter = "all" | "asia" | "london" | "newyork"
export type WeekdayFilter = "all" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
export type DataSourceLabel = "Backtest" | "Live/Manual" | "Mixed"
export type ConfidenceLevel = "Low" | "Medium" | "High"
export type StageStatus = "Current" | "Locked" | "Ready" | "Completed" | "At Risk"
export type ScenarioKey = "optimistic" | "base" | "conservative"

export type FundedRiskConfig = {
  mode: RiskMode
  riskPercent: number
  fixedRisk: number
}

export type StrategyProfile = {
  winRate: number
  avgRrRatio: number | null
  profitFactor: number
  expectancyR: number
  expectancyUsd: number
  closedTrades: number
  avgTradesPerDay: number
  avgTradesPerWeek: number
  medianTradesPerWeek: number
  maxDrawdown: number
  maxDrawdownPct: number
  worstLossStreak: number
  bestWinStreak: number
  avgWin: number
  avgLoss: number
  avgWinR: number
  avgLossR: number
  bestDay: { date: string; pnl: number } | null
  worstDay: { date: string; pnl: number } | null
  bestWeek: { key: string; label: string; pnl: number } | null
  worstWeek: { key: string; label: string; pnl: number } | null
  rMethod: RMultipleStats["method"]
  stopLossSampleSize: number
}

export type DrawdownStress = {
  historicalStreak: number
  stress1Streak: number
  stress2Streak: number
  historicalDdPct: number
  historicalDdUsd: number
  stress1R: number
  stress2R: number
}

export type StageProjection = {
  id: string
  size: number
  label: string
  shortLabel: string
  status: StageStatus
  riskPerTrade: number
  oneR: number
  profitTarget: number
  drawdownLimit: number
  targetR: number
  expectedRPerTrade: number
  expectedTrades: number | null
  optimisticTrades: number | null
  baseTrades: number | null
  conservativeTrades: number | null
  expectedDays: number | null
  optimisticDays: number | null
  baseDays: number | null
  conservativeDays: number | null
  safetyBufferDays: number | null
  historicalDdPct: number
  stressDdPct: number
  stressDdUsd: number
  monteCarlo: MonteCarloResult
}

export type RiskRecommendation = {
  conservative: number
  recommended: number
  aggressive: number
  note: string
}

export type ConfidenceScore = {
  score: number
  level: ConfidenceLevel
  projectionLevel: ConfidenceLevel
  label: string
}

export type RiskComparisonRow = {
  riskPercent: number
  expectedReturnR: number
  medianMaxDrawdownPct: number
  p95MaxDrawdownPct: number
  breachPct: number
  targetHitPct: number
}

export type FundedRoadmapModel = {
  profile: StrategyProfile
  stress: DrawdownStress
  stages: StageProjection[]
  happyFlowDays: number | null
  happyFlowWeeks: number | null
  happyFlowMonths: number | null
  totalDays: Record<ScenarioKey, number | null>
  confidence: ConfidenceScore
  recommendation: RiskRecommendation
  riskComparison: RiskComparisonRow[]
  rDistribution: { bucket: string; count: number }[]
  tradesToTargetHist: { label: string; count: number }[]
  drawdownHist: { label: string; count: number }[]
  projectedEquity: { trade: number; equity: number }[]
  scalingCurve: { label: string; size: number; days: number | null }[]
}

const SESSION_GROUPS: Record<Exclude<SessionFilter, "all">, TradingSession[]> = {
  asia: ["PreAsia", "AsiaOpen", "AsiaMid", "AsiaClose"],
  london: ["PreLondon", "LondonOpen", "LondonMid", "LondonNyOverlap"],
  newyork: ["NewYorkOpen", "NewYorkMid", "NewYorkClose", "LondonNyOverlap"],
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function round(value: number, places = 2) {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

export function dataSourceLabel(source: string): DataSourceLabel {
  if (source === "tradingview") return "Backtest"
  if (source === "manual") return "Live/Manual"
  return "Mixed"
}

export function filterFundedTrades(
  trades: FundedTrade[],
  options: {
    timezone: string
    direction?: DirectionFilter
    session?: SessionFilter
    weekday?: WeekdayFilter
  },
) {
  const direction = options.direction ?? "all"
  const session = options.session ?? "all"
  const weekday = options.weekday ?? "all"

  return trades.filter((trade) => {
    if (direction === "long" && trade.trade_type !== "Buy") return false
    if (direction === "short" && trade.trade_type !== "Sell") return false

    const entry = toDate(trade.entry_date)
    if (!entry) return weekday === "all" && session === "all"

    const parts = getZonedParts(entry, options.timezone)
    if (weekday !== "all" && normalizeWeekday(parts.weekday) !== weekday) return false
    if (session !== "all") {
      const key = classifySession(parts.hour, parts.minute)
      if (!SESSION_GROUPS[session].includes(key)) return false
    }
    return true
  })
}

export function oneRValue(accountSize: number, config: FundedRiskConfig) {
  if (config.mode === "fixed") return Math.max(0, config.fixedRisk)
  return accountSize * (config.riskPercent / 100)
}

function tradesToDays(trades: number | null, avgTradesPerDay: number) {
  if (trades == null || !(avgTradesPerDay > 0)) return null
  return trades / avgTradesPerDay
}

function expectedTrades(targetR: number, expectancyR: number) {
  if (!(targetR > 0) || !(expectancyR > 0)) return null
  return targetR / expectancyR
}

export function buildStrategyProfile(analytics: AnalyticsResult, rStats: RMultipleStats): StrategyProfile {
  const weeks = analytics.byWeek.filter((week) => week.trades > 0)
  const weekCounts = weeks.map((week) => week.trades)
  const bestWeek = weeks.reduce<(typeof weeks)[number] | null>(
    (best, week) => (!best || week.netPnl > best.netPnl ? week : best),
    null,
  )
  const worstWeek = weeks.reduce<(typeof weeks)[number] | null>(
    (worst, week) => (!worst || week.netPnl < worst.netPnl ? week : worst),
    null,
  )

  return {
    winRate: analytics.overview.winRate,
    avgRrRatio: rStats.avgRrRatio,
    profitFactor: analytics.overview.profitFactor,
    expectancyR: rStats.expectancyR,
    expectancyUsd: analytics.overview.expectancy,
    closedTrades: analytics.overview.closedTrades,
    avgTradesPerDay: analytics.overview.avgTradesPerDay,
    avgTradesPerWeek: weekCounts.length ? weekCounts.reduce((sum, n) => sum + n, 0) / weekCounts.length : 0,
    medianTradesPerWeek: median(weekCounts),
    maxDrawdown: analytics.overview.maxDrawdown,
    maxDrawdownPct: analytics.overview.maxDrawdownPct,
    worstLossStreak: analytics.records.worstLossStreak,
    bestWinStreak: analytics.records.bestWinStreak,
    avgWin: analytics.overview.avgWin,
    avgLoss: analytics.overview.avgLoss,
    avgWinR: rStats.avgWinR,
    avgLossR: rStats.avgLossR,
    bestDay: analytics.overview.bestDay,
    worstDay: analytics.overview.worstDay,
    bestWeek: bestWeek ? { key: bestWeek.key, label: bestWeek.label, pnl: bestWeek.netPnl } : null,
    worstWeek: worstWeek ? { key: worstWeek.key, label: worstWeek.label, pnl: worstWeek.netPnl } : null,
    rMethod: rStats.method,
    stopLossSampleSize: rStats.stopLossSampleSize,
  }
}

export function buildDrawdownStress(profile: StrategyProfile): DrawdownStress {
  const historicalStreak = profile.worstLossStreak
  return {
    historicalStreak,
    stress1Streak: Math.max(1, Math.round(historicalStreak * 1.5)),
    stress2Streak: Math.max(2, Math.round(historicalStreak * 2)),
    historicalDdPct: profile.maxDrawdownPct,
    historicalDdUsd: profile.maxDrawdown,
    stress1R: Math.max(1, Math.round(historicalStreak * 1.5)),
    stress2R: Math.max(2, Math.round(historicalStreak * 2)),
  }
}

export function computeConfidence(analytics: AnalyticsResult, rStats: RMultipleStats): ConfidenceScore {
  const n = analytics.overview.closedTrades
  let score = 0

  if (n >= 400) score += 32
  else if (n >= 200) score += 26
  else if (n >= 100) score += 20
  else if (n >= 50) score += 10
  else score += 4

  const weekPnls = analytics.byWeek.filter((week) => week.trades > 0).map((week) => week.netPnl)
  if (weekPnls.length >= 4) {
    const avg = weekPnls.reduce((sum, value) => sum + value, 0) / weekPnls.length
    const variance = weekPnls.reduce((sum, value) => sum + (value - avg) ** 2, 0) / weekPnls.length
    const cv = Math.abs(avg) > 0 ? Math.sqrt(variance) / Math.abs(avg) : 2
    if (cv < 0.8) score += 18
    else if (cv < 1.4) score += 10
    else score += 4
  }

  const monthPnls = analytics.byMonth.filter((month) => month.trades > 0).map((month) => month.netPnl)
  if (monthPnls.length >= 3) {
    const positive = monthPnls.filter((value) => value > 0).length
    score += positive / monthPnls.length >= 0.6 ? 12 : 5
  }

  if (analytics.overview.maxDrawdownPct < 15) score += 10
  else if (analytics.overview.maxDrawdownPct < 25) score += 6
  else score += 2

  if (analytics.overview.winRate >= 45 && analytics.overview.winRate <= 72) score += 10
  else score += 4

  if (rStats.expectancyR >= 0.4) score += 14
  else if (rStats.expectancyR > 0) score += 8

  score = Math.max(0, Math.min(100, Math.round(score)))
  const level: ConfidenceLevel = score >= 70 ? "High" : score >= 40 ? "Medium" : "Low"
  const projectionLevel: ConfidenceLevel = n < 100 ? "Low" : level

  return {
    score,
    level,
    projectionLevel,
    label: "Internal strategy stability score",
  }
}

function stageStatus(index: number, currentIndex: number, stressDdPct: number, maxDdPct: number, hitPct: number): StageStatus {
  if (index < currentIndex) return "Completed"
  if (index > currentIndex) return "Locked"
  if (stressDdPct >= maxDdPct || hitPct < 40) return "At Risk"
  if (hitPct >= 75 && stressDdPct < maxDdPct * 0.85) return "Ready"
  return "Current"
}

function compactMonteCarlo(result: MonteCarloResult): MonteCarloResult {
  return {
    ...result,
    tradesToTarget: [],
    maxDrawdownsR: [],
  }
}

export function buildStageProjection(
  level: FundedAccountLevel,
  index: number,
  currentIndex: number,
  profile: StrategyProfile,
  stress: DrawdownStress,
  rMultiples: number[],
  rules: FundedChallengeRules,
  config: FundedRiskConfig,
): StageProjection {
  const oneR = oneRValue(level.size, config)
  const profitTarget = level.size * (rules.profitTargetPct / 100)
  const drawdownLimit = level.size * (rules.maxDrawdownPct / 100)
  const targetR = oneR > 0 ? profitTarget / oneR : 0
  const maxDrawdownR = oneR > 0 ? drawdownLimit / oneR : 0
  const stressDdUsd = stress.stress2Streak * oneR
  const stressDdPct = level.size > 0 ? (stressDdUsd / level.size) * 100 : 0

  const mc = runMonteCarlo(rMultiples, { targetR, maxDrawdownR })
  const naive = expectedTrades(targetR, profile.expectancyR)
  const optimisticTrades = mc.p10TradesToTarget ?? (naive != null ? naive * 0.7 : null)
  const baseTrades = mc.medianTradesToTarget ?? naive
  const conservativeTrades = mc.p90TradesToTarget ?? (naive != null ? naive * 1.6 : null)

  return {
    id: level.id,
    size: level.size,
    label: level.label,
    shortLabel: level.shortLabel,
    status: stageStatus(index, currentIndex, stressDdPct, rules.maxDrawdownPct, mc.targetHitPct),
    riskPerTrade: oneR,
    oneR,
    profitTarget,
    drawdownLimit,
    targetR,
    expectedRPerTrade: profile.expectancyR,
    expectedTrades: naive,
    optimisticTrades,
    baseTrades,
    conservativeTrades,
    expectedDays: tradesToDays(naive, profile.avgTradesPerDay),
    optimisticDays: tradesToDays(optimisticTrades, profile.avgTradesPerDay),
    baseDays: tradesToDays(baseTrades, profile.avgTradesPerDay),
    conservativeDays: tradesToDays(conservativeTrades, profile.avgTradesPerDay),
    safetyBufferDays: tradesToDays(conservativeTrades, profile.avgTradesPerDay),
    historicalDdPct: profile.maxDrawdownPct,
    stressDdPct,
    stressDdUsd,
    monteCarlo: compactMonteCarlo(mc),
  }
}

export function recommendRisk(
  rMultiples: number[],
  profile: StrategyProfile,
  rules: FundedChallengeRules,
  accountSize: number,
): RiskRecommendation {
  const candidates = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
  const passing: number[] = []

  for (const riskPercent of candidates) {
    const oneR = accountSize * (riskPercent / 100)
    const targetR = oneR > 0 ? (accountSize * (rules.profitTargetPct / 100)) / oneR : 0
    const maxDrawdownR = oneR > 0 ? (accountSize * (rules.maxDrawdownPct / 100)) / oneR : 0
    const mc = runMonteCarlo(rMultiples, { targetR, maxDrawdownR, simulations: 400 })
    const medianDdPct = (mc.medianMaxDrawdownR * riskPercent)
    if (mc.drawdownFirstPct <= 12 && medianDdPct < rules.maxDrawdownPct) passing.push(riskPercent)
  }

  const recommended = passing.includes(1) ? 1 : passing.at(-1) ?? 0.25
  const conservative = passing.find((value) => value <= 0.5) ?? passing[0] ?? 0.25
  const aggressiveCandidate = passing.find((value) => value >= 1.5)
  const aggressive = aggressiveCandidate ?? recommended
  const note =
    !aggressiveCandidate && recommended < 1.5
      ? "Aggressive risk is hidden because simulated drawdown breaches the account limit."
      : profile.expectancyR <= 0
        ? "Expectancy is not positive on this filter — treat every timeline as a warning, not a plan."
        : "Sized from historical R-multiples and the selected drawdown cap."

  return { conservative, recommended, aggressive, note }
}

export function buildRiskComparison(
  rMultiples: number[],
  rules: FundedChallengeRules,
  accountSize: number,
  expectancyR: number,
): RiskComparisonRow[] {
  return RISK_COMPARISON_PERCENTS.map((riskPercent) => {
    const oneR = accountSize * (riskPercent / 100)
    const targetR = oneR > 0 ? (accountSize * (rules.profitTargetPct / 100)) / oneR : 0
    const maxDrawdownR = oneR > 0 ? (accountSize * (rules.maxDrawdownPct / 100)) / oneR : 0
    const mc = runMonteCarlo(rMultiples, { targetR, maxDrawdownR, simulations: 500 })
    return {
      riskPercent,
      expectedReturnR: expectancyR,
      medianMaxDrawdownPct: mc.medianMaxDrawdownR * riskPercent,
      p95MaxDrawdownPct: mc.p95MaxDrawdownR * riskPercent,
      breachPct: mc.drawdownFirstPct,
      targetHitPct: mc.targetHitPct,
    }
  })
}

function sumDays(stages: StageProjection[], key: "optimisticDays" | "baseDays" | "conservativeDays") {
  if (stages.some((stage) => stage[key] == null)) return null
  return stages.reduce((sum, stage) => sum + (stage[key] ?? 0), 0)
}

function projectedEquityPath(rMultiples: number[], start = 5000, oneR = 50, trades = 80) {
  if (!rMultiples.length) return []
  const random = (index: number) => rMultiples[index % rMultiples.length]
  let equity = start
  const points = [{ trade: 0, equity }]
  for (let i = 0; i < trades; i++) {
    equity += random(i) * oneR
    points.push({ trade: i + 1, equity })
  }
  return points
}

export function buildFundedRoadmap(input: {
  analytics: AnalyticsResult
  rStats: RMultipleStats
  rules: FundedChallengeRules
  risk: FundedRiskConfig
  currentStageIndex?: number
  ladder?: FundedAccountLevel[]
}): FundedRoadmapModel {
  const ladder = input.ladder ?? FUNDED_ACCOUNT_LADDER
  const currentIndex = Math.max(0, Math.min(ladder.length - 1, input.currentStageIndex ?? 0))
  const profile = buildStrategyProfile(input.analytics, input.rStats)
  const stress = buildDrawdownStress(profile)
  const stages = ladder.map((level, index) =>
    buildStageProjection(
      level,
      index,
      currentIndex,
      profile,
      stress,
      input.rStats.rMultiples,
      input.rules,
      input.risk,
    ),
  )

  const first = stages[currentIndex] ?? stages[0]
  const recommendation = recommendRisk(input.rStats.rMultiples, profile, input.rules, first.size)
  const riskComparison = buildRiskComparison(input.rStats.rMultiples, input.rules, first.size, profile.expectancyR)
  const firstMc = runMonteCarlo(input.rStats.rMultiples, {
    targetR: first.targetR,
    maxDrawdownR: first.oneR > 0 ? first.drawdownLimit / first.oneR : 0,
  })

  const happyFlowDays = sumDays(stages, "optimisticDays")
  const baseDays = sumDays(stages, "baseDays")
  const conservativeDays = sumDays(stages, "conservativeDays")

  return {
    profile,
    stress,
    stages,
    happyFlowDays,
    happyFlowWeeks: happyFlowDays != null ? happyFlowDays / 7 : null,
    happyFlowMonths: happyFlowDays != null ? happyFlowDays / 30 : null,
    totalDays: {
      optimistic: happyFlowDays,
      base: baseDays,
      conservative: conservativeDays,
    },
    confidence: computeConfidence(input.analytics, input.rStats),
    recommendation,
    riskComparison,
    rDistribution: input.rStats.distribution,
    tradesToTargetHist: histogram(firstMc.tradesToTarget, 8).map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
    })),
    drawdownHist: histogram(firstMc.maxDrawdownsR, 8).map((bucket) => ({
      label: `${bucket.start.toFixed(1)}R`,
      count: bucket.count,
    })),
    projectedEquity: projectedEquityPath(input.rStats.rMultiples, first.size, first.oneR),
    scalingCurve: stages.map((stage) => ({
      label: stage.shortLabel,
      size: stage.size,
      days: stage.optimisticDays,
    })),
  }
}

export function formatDays(days: number | null) {
  if (days == null || !Number.isFinite(days)) return "—"
  if (days < 1) return "<1 day"
  if (days < 14) return `${Math.round(days)} days`
  if (days < 60) return `${(days / 7).toFixed(1)} weeks`
  return `${(days / 30).toFixed(1)} months`
}

export function formatRr(ratio: number | null) {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return "—"
  return `1:${ratio.toFixed(1)}`
}

export { formatAccountSize, round }

export type CompareSnapshot = {
  label: string
  winRate: number
  avgRrRatio: number | null
  profitFactor: number
  expectancyR: number
  maxDrawdownPct: number
  closedTrades: number
  avgTradesPerWeek: number
  estimatedDays: number | null
}

export function toCompareSnapshot(label: string, model: FundedRoadmapModel): CompareSnapshot {
  return {
    label,
    winRate: model.profile.winRate,
    avgRrRatio: model.profile.avgRrRatio,
    profitFactor: model.profile.profitFactor,
    expectancyR: model.profile.expectancyR,
    maxDrawdownPct: model.profile.maxDrawdownPct,
    closedTrades: model.profile.closedTrades,
    avgTradesPerWeek: model.profile.avgTradesPerWeek,
    estimatedDays: model.stages[0]?.optimisticDays ?? null,
  }
}

export function filterLabel(filters: {
  instrument?: string
  strategy?: string
  session?: SessionFilter
  direction?: DirectionFilter
}) {
  const parts = [
    filters.instrument && filters.instrument !== "all" ? filters.instrument : null,
    filters.strategy && filters.strategy !== "all" ? filters.strategy : null,
    filters.session && filters.session !== "all" ? filters.session : null,
    filters.direction && filters.direction !== "all" ? filters.direction : null,
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : "All trades"
}

export type { AnalyticsTrade }
