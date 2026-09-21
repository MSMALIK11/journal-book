import type { AnalyticsResult, AnalyticsTrade } from "@/lib/trading/analytics"
import {
  FUNDED_ACCOUNT_LADDER,
  RISK_COMPARISON_PERCENTS,
  formatAccountSize,
  type FundedAccountLevel,
  type FundedChallengeRules,
  type RiskMode,
} from "@/lib/trading/funded-presets"
import { histogram, resolveMonteCarloMaxTrades, runMonteCarlo, type MonteCarloResult } from "@/lib/trading/monte-carlo"
import { computeChallengeRStats, type FundedTrade, type RMultipleStats } from "@/lib/trading/r-multiples"
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
  tradingDays: number
  avgTradesPerDay: number
  medianTradesPerDay: number
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
  payoutUsd: number
  dailyLossCap: number
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

export type PassCheckStatus = "pass" | "warn" | "fail"

export type ChallengePassCheck = {
  id: string
  label: string
  status: PassCheckStatus
  detail: string
}

export type PassLikelihood = "high" | "medium" | "low" | "none"

export type ChallengeAssessment = {
  likelihood: PassLikelihood
  headline: string
  summary: string
  checks: ChallengePassCheck[]
  suggestedRiskPct: number
  conservativeRiskPct: number
  planTrades: {
    optimistic: number | null
    base: number | null
    conservative: number | null
  }
  planDays: {
    optimistic: number | null
    base: number | null
    conservative: number | null
  }
}

export type FundedRoadmapModel = {
  profile: StrategyProfile
  stress: DrawdownStress
  assessment: ChallengeAssessment
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
  realizedPnl: number
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

function roundTrades(value: number | null | undefined) {
  return value != null && Number.isFinite(value) ? Math.round(value) : null
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

type TimelinePace = "optimistic" | "base" | "conservative"

function resolveTradesPerDay(
  profile: Pick<StrategyProfile, "avgTradesPerDay" | "medianTradesPerDay">,
  pace: TimelinePace,
) {
  const avg = profile.avgTradesPerDay
  const median = profile.medianTradesPerDay > 0 ? profile.medianTradesPerDay : avg
  if (!(avg > 0)) return 0
  if (pace === "optimistic") return Math.max(avg, median)
  if (pace === "conservative") return Math.min(avg, median)
  return avg
}

function tradesToDays(
  trades: number | null,
  profile: Pick<StrategyProfile, "avgTradesPerDay" | "medianTradesPerDay">,
  pace: TimelinePace = "base",
) {
  const tradesPerDay = resolveTradesPerDay(profile, pace)
  if (trades == null || !(tradesPerDay > 0)) return null
  return trades / tradesPerDay
}

function expectedTrades(targetR: number, expectancyR: number) {
  if (!(targetR > 0) || !(expectancyR > 0)) return null
  return targetR / expectancyR
}

export function buildStrategyProfile(
  analytics: AnalyticsResult,
  rStats: RMultipleStats,
  slRStats?: RMultipleStats,
): StrategyProfile {
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
    tradingDays: analytics.overview.tradingDays,
    avgTradesPerDay: analytics.overview.avgTradesPerDay,
    medianTradesPerDay: analytics.overview.medianTradesPerDay,
    avgTradesPerWeek: analytics.overview.avgTradesPerWeek,
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
    stopLossSampleSize: slRStats?.stopLossSampleSize ?? rStats.stopLossSampleSize,
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

export function buildChallengeAssessment(
  stage: StageProjection,
  profile: StrategyProfile,
  recommendation: RiskRecommendation,
  rules: FundedChallengeRules,
): ChallengeAssessment {
  const mc = stage.monteCarlo

  const checks: ChallengePassCheck[] = [
    {
      id: "edge",
      label: "Positive expectancy",
      status:
        profile.expectancyR > 0.15 ? "pass" : profile.expectancyR > 0 ? "warn" : "fail",
      detail: `${profile.expectancyR >= 0 ? "+" : ""}${profile.expectancyR.toFixed(2)}R per trade at ${formatAccountSize(stage.oneR)} planned 1R`,
    },
    {
      id: "sample",
      label: "Enough trade history",
      status:
        profile.closedTrades >= 100 ? "pass" : profile.closedTrades >= 50 ? "warn" : "fail",
      detail: `${profile.closedTrades} closed trades on this filter`,
    },
    {
      id: "reach",
      label: "Simulations reach profit target",
      status: mc.targetHitPct >= 75 ? "pass" : mc.targetHitPct >= 40 ? "warn" : "fail",
      detail: `${mc.targetHitPct.toFixed(0)}% of 1,000 sims hit +${stage.targetR.toFixed(1)}R before max DD`,
    },
    {
      id: "breach",
      label: "Low fail-before-target rate",
      status: mc.drawdownFirstPct <= 10 ? "pass" : mc.drawdownFirstPct <= 25 ? "warn" : "fail",
      detail: `${mc.drawdownFirstPct.toFixed(0)}% hit max drawdown before the profit target`,
    },
    {
      id: "stress",
      label: "2× loss streak within max DD",
      status:
        stage.stressDdPct < rules.maxDrawdownPct * 0.9
          ? "pass"
          : stage.stressDdPct <= rules.maxDrawdownPct
            ? "warn"
            : "fail",
      detail: `Stress path ≈ ${stage.stressDdPct.toFixed(1)}% vs ${rules.maxDrawdownPct}% firm limit`,
    },
    {
      id: "history_dd",
      label: "Past drawdown within limit",
      status:
        profile.maxDrawdownPct <= rules.maxDrawdownPct * 0.85
          ? "pass"
          : profile.maxDrawdownPct <= rules.maxDrawdownPct
            ? "warn"
            : "fail",
      detail: `Historical peak DD ${profile.maxDrawdownPct.toFixed(1)}% on this filter`,
    },
    {
      id: "timeout",
      label: "Simulations finish (not stuck)",
      status: mc.timeoutPct <= 5 ? "pass" : mc.timeoutPct <= 20 ? "warn" : "fail",
      detail: `${mc.timeoutPct.toFixed(0)}% of sims timed out before target or max DD`,
    },
  ]

  const passCount = checks.filter((check) => check.status === "pass").length
  const failCount = checks.filter((check) => check.status === "fail").length

  let likelihood: PassLikelihood
  let headline: string
  let summary: string

  if (profile.expectancyR <= 0 || profile.closedTrades < 30) {
    likelihood = "none"
    headline = "Not ready — no proven edge on this filter"
    summary =
      "Expectancy is flat or negative, or the sample is too small. Do not start a funded challenge on this data yet."
  } else if (failCount >= 2 || mc.targetHitPct < 40 || profile.expectancyR <= 0) {
    likelihood = "low"
    headline = "Low pass odds at current risk"
    summary =
      "Multiple checks failed. Lower risk, tighten rules, or improve the strategy sample before attempting a challenge."
  } else if (passCount >= 6 && mc.targetHitPct >= 75 && mc.drawdownFirstPct <= 15) {
    likelihood = "high"
    headline = "Strong pass profile on this data"
    summary =
      "Monte Carlo, expectancy, and drawdown checks align. Follow the 1R plan, daily stop, and conservative timeline below."
  } else if (failCount >= 1) {
    likelihood = "low"
    headline = "Risky — fix fails before funding"
    summary =
      "At least one check failed. Reduce risk, improve sample size, or wait for better stats before a challenge."
  } else if (passCount >= 5) {
    likelihood = "medium"
    headline = "Passable with discipline"
    summary =
      "Edge looks real but not bulletproof. Use recommended risk, respect daily DD, and plan around the conservative trade count."
  } else {
    likelihood = "medium"
    headline = "Borderline — proceed carefully"
    summary =
      "Mixed signals. You may pass with strict risk control, but plan around the conservative timeline."
  }

  return {
    likelihood,
    headline,
    summary,
    checks,
    suggestedRiskPct: recommendation.recommended,
    conservativeRiskPct: recommendation.conservative,
    planTrades: {
      optimistic: stage.optimisticTrades,
      base: stage.baseTrades,
      conservative: stage.conservativeTrades,
    },
    planDays: {
      optimistic: stage.optimisticDays,
      base: stage.baseDays,
      conservative: stage.conservativeDays,
    },
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
  trades: FundedTrade[],
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

  const stageRStats = computeChallengeRStats(trades, oneR)
  const rMultiples = stageRStats.rMultiples
  const expectancyR = stageRStats.expectancyR

  const naive = expectedTrades(targetR, expectancyR)
  const maxTrades = resolveMonteCarloMaxTrades(rMultiples, targetR, expectancyR)
  const mc = runMonteCarlo(rMultiples, { targetR, maxDrawdownR, maxTrades })
  const optimisticTrades = roundTrades(
    mc.p10TradesToTarget ?? (naive != null ? naive * 0.85 : null),
  )
  const baseTrades = roundTrades(mc.medianTradesToTarget ?? naive)
  const conservativeTrades = roundTrades(
    mc.p90TradesToTarget ?? (naive != null ? naive * 1.35 : null),
  )
  const conservativeDaysRaw = tradesToDays(conservativeTrades, profile, "conservative")

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
    expectedRPerTrade: expectancyR,
    expectedTrades: roundTrades(naive),
    optimisticTrades,
    baseTrades,
    conservativeTrades,
    expectedDays: tradesToDays(naive, profile, "base"),
    optimisticDays: tradesToDays(optimisticTrades, profile, "optimistic"),
    baseDays: tradesToDays(baseTrades, profile, "base"),
    conservativeDays:
      conservativeDaysRaw == null ? null : Math.max(conservativeDaysRaw, rules.minTradingDays),
    safetyBufferDays:
      conservativeDaysRaw == null ? null : Math.max(conservativeDaysRaw, rules.minTradingDays),
    historicalDdPct: profile.maxDrawdownPct,
    stressDdPct,
    stressDdUsd,
    payoutUsd: profitTarget * (rules.profitSplitPct / 100),
    dailyLossCap: level.size * (rules.dailyDrawdownPct / 100),
    monteCarlo: compactMonteCarlo(mc),
  }
}

export function recommendRisk(
  trades: FundedTrade[],
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
    const stageRStats = computeChallengeRStats(trades, oneR)
    const mc = runMonteCarlo(stageRStats.rMultiples, {
      targetR,
      maxDrawdownR,
      simulations: 400,
      maxTrades: resolveMonteCarloMaxTrades(stageRStats.rMultiples, targetR, stageRStats.expectancyR),
    })
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
  trades: FundedTrade[],
  rules: FundedChallengeRules,
  accountSize: number,
): RiskComparisonRow[] {
  return RISK_COMPARISON_PERCENTS.map((riskPercent) => {
    const oneR = accountSize * (riskPercent / 100)
    const targetR = oneR > 0 ? (accountSize * (rules.profitTargetPct / 100)) / oneR : 0
    const maxDrawdownR = oneR > 0 ? (accountSize * (rules.maxDrawdownPct / 100)) / oneR : 0
    const stageRStats = computeChallengeRStats(trades, oneR)
    const mc = runMonteCarlo(stageRStats.rMultiples, {
      targetR,
      maxDrawdownR,
      simulations: 500,
      maxTrades: resolveMonteCarloMaxTrades(stageRStats.rMultiples, targetR, stageRStats.expectancyR),
    })
    return {
      riskPercent,
      expectedReturnR: stageRStats.expectancyR,
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
  trades: FundedTrade[]
  slRStats: RMultipleStats
  rules: FundedChallengeRules
  risk: FundedRiskConfig
  currentStageIndex?: number
  ladder?: FundedAccountLevel[]
}): FundedRoadmapModel {
  const ladder = input.ladder ?? FUNDED_ACCOUNT_LADDER
  const currentIndex = Math.max(0, Math.min(ladder.length - 1, input.currentStageIndex ?? 0))
  const currentLevel = ladder[currentIndex] ?? ladder[0]
  const challengeRStats = computeChallengeRStats(
    input.trades,
    oneRValue(currentLevel.size, input.risk),
  )
  const profile = buildStrategyProfile(input.analytics, challengeRStats, input.slRStats)
  const stress = buildDrawdownStress(profile)
  const stages = ladder.map((level, index) =>
    buildStageProjection(
      level,
      index,
      currentIndex,
      profile,
      stress,
      input.trades,
      input.rules,
      input.risk,
    ),
  )

  const first = stages[currentIndex] ?? stages[0]
  const recommendation = recommendRisk(input.trades, profile, input.rules, first.size)
  const riskComparison = buildRiskComparison(input.trades, input.rules, first.size)
  const firstChallengeR = computeChallengeRStats(input.trades, first.oneR)
  const firstMc = runMonteCarlo(firstChallengeR.rMultiples, {
    targetR: first.targetR,
    maxDrawdownR: first.oneR > 0 ? first.drawdownLimit / first.oneR : 0,
    maxTrades: resolveMonteCarloMaxTrades(
      firstChallengeR.rMultiples,
      first.targetR,
      firstChallengeR.expectancyR,
    ),
  })

  const happyFlowDays = sumDays(stages, "optimisticDays")
  const baseDays = sumDays(stages, "baseDays")
  const conservativeDays = sumDays(stages, "conservativeDays")
  const assessment = buildChallengeAssessment(first, profile, recommendation, input.rules)

  return {
    profile,
    stress,
    assessment,
    stages,
    happyFlowDays,
    happyFlowWeeks: happyFlowDays != null ? happyFlowDays / 7 : null,
    happyFlowMonths: happyFlowDays != null ? happyFlowDays / 30 : null,
    totalDays: {
      optimistic: happyFlowDays,
      base: baseDays,
      conservative: conservativeDays,
    },
    confidence: computeConfidence(input.analytics, challengeRStats),
    recommendation,
    riskComparison,
    rDistribution: challengeRStats.distribution,
    tradesToTargetHist: histogram(firstMc.tradesToTarget, 8).map((bucket) => ({
      label: bucket.label,
      count: bucket.count,
    })),
    drawdownHist: histogram(firstMc.maxDrawdownsR, 8).map((bucket) => ({
      label: `${bucket.start.toFixed(1)}R`,
      count: bucket.count,
    })),
    projectedEquity: projectedEquityPath(firstChallengeR.rMultiples, first.size, first.oneR),
    scalingCurve: stages.map((stage) => ({
      label: stage.shortLabel,
      size: stage.size,
      days: stage.optimisticDays,
    })),
    realizedPnl: input.analytics.overview.netPnl,
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
