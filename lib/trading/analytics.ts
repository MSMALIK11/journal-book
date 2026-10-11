import {
  classifySession,
  getZonedParts,
  localDayEndUtc,
  localDayStartUtc,
  normalizeWeekday,
  SESSION_DETAIL_LABELS,
  SESSION_LABELS,
  SESSION_ORDER,
  WEEKDAY_ORDER,
} from "@/lib/trading/sessions"
import {
  R_BUCKET_DEFINITIONS,
  resolveTradeSpec,
  summarizeRMultiples,
  toRMultiples,
  type RMultipleSample,
  type RMethod,
} from "@/lib/trading/r-multiples"
import { calculateRisk, calculateRR } from "@/lib/trading/calculator"
import { histogram } from "@/lib/trading/monte-carlo"
import {
  calmar,
  dailyReturnsFromEquity,
  kellyFraction,
  rollingEdge,
  sharpe,
  sortino,
  tStat,
  ulcer,
  wilsonInterval,
  type RiskRatios,
  type RollingEdgePoint,
  type SignificanceSummary,
} from "@/lib/trading/risk-metrics"

export type { RiskRatios, RollingEdgePoint, SignificanceSummary } from "@/lib/trading/risk-metrics"
import {
  computeZoneThresholds,
  rankAvoidBuckets,
  rankBestBuckets,
} from "@/lib/trading/zone-thresholds"

export const MIN_BUCKET_TRADES = 5

export type AnalyticsTrade = {
  _id?: unknown
  /** Present on portfolio queries that span several accounts. */
  accountId?: string | null
  entry_date: Date | string
  exit_date?: Date | string | null
  entry_price?: number | null
  exit_price?: number | null
  net_pnl?: number | null
  return_pct?: number | null
  commission?: number | null
  strategy?: string | null
  instrument?: string | null
  trade_type?: "Buy" | "Sell" | string
  signal?: string | null
  source?: "manual" | "tradingview" | string
  stop_loss?: number | null
  target?: number | null
  quantity?: number | null
  asset_type?: string | null
  account_balance?: number | null
}

export type TopTradeEntry = {
  id: string
  instrument: string
  trade_type: string
  signal?: string | null
  strategy?: string | null
  entry_date: string
  exit_date: string | null
  entry_price?: number | null
  exit_price?: number | null
  net_pnl: number
  return_pct?: number | null
}

export type TradeExtremes = {
  maxWin: number
  maxLoss: number
}

export type MaxDrawdownEpisode = {
  amount: number
  amountPct: number
  peakDate: string | null
  troughDate: string
  peakEquity: number
  troughEquity: number
  reason: string
  trades: TopTradeEntry[]
  /** Calendar days from peak to trough. */
  durationDays: number
  /** ISO date when equity first recovered to peak; null if still underwater. */
  recoveryDate: string | null
  /** Calendar days from trough to recovery. */
  recoveryDays: number | null
  /** Whether recovery was achieved within the sample. */
  recovered: boolean
}

export type BucketStats = {
  key: string
  label: string
  trades: number
  wins: number
  losses: number
  winRate: number
  netPnl: number
  avgPnl: number
  /** Mean R over the trades in this bucket that have a resolvable R. */
  avgR?: number | null
  /** How many of `trades` contributed to `avgR`. */
  rTrades?: number
  /** Mean risk % (risked amount / balance) for trades with a plan. */
  riskPctAvg?: number | null
  /** Total commission carried by trades in this bucket. */
  commission?: number
  /** commission / this bucket's gross profit (0–1); null when no gross profit. */
  feeDragPct?: number | null
}

export type WeeklyBucket = BucketStats & {
  grossProfit: number
  grossLoss: number
}

export type MonthlyBucket = BucketStats & {
  grossProfit: number
  grossLoss: number
  /** Compounded return % from TV per-trade return_pct in this month. */
  returnPct: number | null
  returnTrades: number
}

export type AvoidInsight = {
  key: string
  label: string
  trades: number
  winRate: number
  netPnl: number
  reason: string
}

export type EquityPoint = {
  date: string
  equity: number
  drawdown: number
  drawdownPct: number
}

export type StreakInfo = {
  type: "win" | "loss" | "none"
  count: number
}

export type DayRecord = {
  date: string
  label: string
  pnl: number
}

export type StreakEpisode = {
  count: number
  totalPnl: number
  trades: TopTradeEntry[]
}

export type AnalyticsRecords = {
  currentStreak: StreakInfo
  bestWinStreak: number
  worstLossStreak: number
  bestWinStreakEpisode: StreakEpisode | null
  worstLossStreakEpisode: StreakEpisode | null
  bestDay: DayRecord | null
  worstDay: DayRecord | null
  backtestTimeMs: number | null
  avgHoldTimeMs: number | null
  avgHoldTimeWinMs: number | null
  avgHoldTimeLossMs: number | null
  holdTimeTrades: number
}

export type PnlDistributionBucket = {
  bucket: string
  label: string
  count: number
  netPnl: number
}

export type PeriodComparison = {
  netPnlDelta: number
  winRateDelta: number
  closedTradesDelta: number
  /** Both periods must have a finite profit factor; null when either is infinite/absent. */
  profitFactorDelta: number | null
  expectancyDelta: number
  /** Change in expectancy-R; null when either period has no R sample. */
  avgRDelta: number | null
  /** Signed change in max drawdown % (positive = worse). */
  maxDrawdownPctDelta: number
  label: string
}

export type RMultipleSummary = {
  method: RMethod
  sampleSize: number
  stopLossSampleSize: number
  /** sampleSize / closedTrades — how much of the window has a usable R. */
  coverage: number
  avgWinR: number
  avgLossR: number
  expectancyR: number
  avgRrRatio: number | null
}

export type RiskPlanSummary = {
  coverage: number
  targetCoverage: number
  riskedTotal: number
  avgRiskPct: number | null
  medianRiskPct: number | null
  riskPctSpread: number | null
  riskPctBasis: "account_balance" | "initial_capital" | null
  outcomes: { targetHit: number; stopHit: number; manualClose: number; unknown: number }
  plannedRrAvg: number | null
  realizedRrAvg: number | null
  adherencePct: number | null
  riskPctDistribution: { label: string; count: number }[] | null
}

export type DayStructure = {
  tradingDays: number
  profitableDays: number
  losingDays: number
  breakEvenDays: number
  /** profitableDays / tradingDays, as a percentage. */
  profitableDayPct: number
  avgGreenDay: number
  avgRedDay: number
  longestRedDayRun: number
}

export type ConcentrationSummary = {
  /** Sum of the 5 biggest winners ÷ gross profit (0–1). */
  top5WinShare: number | null
  /** Sum of the 5 biggest losers ÷ gross loss (0–1). */
  top5LossShare: number | null
  /** Largest single trade's P&L ÷ total gross P&L (winners + losers, 0–1). */
  largestTradeShare: number | null
  largestTradeId: string | null
  top5WinPnl: number
  top5LossPnl: number
}

export type FeeSummary = {
  total: number
  coveredTrades: number
  /** coveredTrades / closedTrades — how many trades reported a fee at all. */
  coverage: number
  /** net_pnl as stored, which does NOT subtract commission. */
  netPnlAsStored: number
  /** net_pnl minus total commission — what the fees would leave if not already counted. */
  netPnlAfterFees: number
  /** total commission / gross profit. */
  feeDragPct: number | null
  /** average commission per fee-bearing trade. */
  feePerTrade: number | null
  /** total commission / netPnlAsStored — how much of the edge the fees eat. */
  feeShareOfEdge: number | null
}

export type AttributionMode = "entry" | "exit"
export type AttributionSummary = {
  /** Which date the window was applied to: the trade close anchor, or none. */
  mode: AttributionMode
  /** Inclusive start of the window as a UTC instant. */
  windowStart: string | null
  /** Exclusive end of the window as a UTC instant. */
  windowEnd: string | null
  /** How far the entry_date query was widened to catch trades that closed in the window. */
  lookbackDays: number
  /** Closed trades fetched but excluded because they settled outside the window. */
  dropped: number
  /** Longest hold in the window, so the UI can warn when the lookback may be too short. */
  maxHoldTimeMs: number | null
}

export type AnalyticsResult = {
  overview: {
    totalTrades: number
    closedTrades: number
    openTrades: number
    wins: number
    losses: number
    breakEven: number
    winRate: number
    netPnl: number
    grossProfit: number
    grossLoss: number
    /** grossProfit / grossLoss. null means no losing trade exists yet, i.e. infinite. */
    profitFactor: number | null
    expectancy: number
    avgWin: number
    avgLoss: number
    totalCommission: number
    avgReturnPct: number
    /** Starting capital behind these trades; null when the account has none set. */
    initialCapital: number | null
    /** Net P&L as a percent of `initialCapital`; null when capital is unknown. */
    returnPct: number | null
    maxDrawdown: number
    maxDrawdownPct: number
    /** netPnl / maxDrawdown — how much profit each dollar of drawdown produced. */
    recoveryFactor: number | null
    /** Calendar days from peak to trough of the worst episode. */
    maxDrawdownDurationDays: number | null
    /** ISO date the worst episode recovered (null if still underwater). */
    drawdownRecoveryDate: string | null
    /** Calendar days from trough to recovery. */
    drawdownRecoveryDays: number | null
    /** % of calendar days spent below the running equity peak. */
    underwaterDayPct: number | null
    longTrades: number
    shortTrades: number
    longPnl: number
    shortPnl: number
    bestDay: { date: string; pnl: number } | null
    worstDay: { date: string; pnl: number } | null
    bestMonth: { month: string; pnl: number } | null
    worstMonth: { month: string; pnl: number } | null
    avgHoldTimeMs: number | null
    avgHoldTimeWinMs: number | null
    avgHoldTimeLossMs: number | null
    /** Shortest hold among closed trades that report both entry and exit. */
    minHoldTimeMs: number | null
    /** Longest hold among closed trades that report both entry and exit. */
    maxHoldTimeMs: number | null
    holdTimeTrades: number
    tradingDays: number
    avgTradesPerDay: number
    /** Net P&L divided by days with at least one closed trade. */
    avgProfitPerDay: number
    medianTradesPerDay: number
    minTradesPerDay: number
    maxTradesPerDay: number
    calendarWeeks: number
    avgTradesPerWeek: number
    /** Which date the numbers are attributed to, and how much was dropped. */
    attribution: AttributionSummary
    /** Risk-normalised performance; null when no closed trade has a usable R. */
    r: RMultipleSummary | null
    /** Planned-risk coverage and adherence; null when no trade has stop/target data. */
    riskPlan: RiskPlanSummary | null
    /** How days split into green/red/break-even and the worst red streak. */
    dayStructure: DayStructure | null
    /** How much of total P&L rides on the biggest few trades. */
    concentration: ConcentrationSummary | null
    /** Risk-adjusted return ratios; null when the day sample is too small. */
    riskRatios: RiskRatios | null
    /** Statistical confidence behind the headline win rate and expectancy. */
    significance: SignificanceSummary | null
    /** Commission economics; null when no trade reported a fee. */
    fees: FeeSummary | null
  }
  equityCurve: EquityPoint[]
  byHour: BucketStats[]
  byWeekday: BucketStats[]
  byMonth: MonthlyBucket[]
  byWeek: WeeklyBucket[]
  bySession: BucketStats[]
  avoid: {
    hours: AvoidInsight[]
    days: AvoidInsight[]
    sessions: AvoidInsight[]
    bestHours: AvoidInsight[]
    bestDays: AvoidInsight[]
    bestSessions: AvoidInsight[]
  }
  byStrategy: BucketStats[]
  bySignal: BucketStats[]
  byInstrument: BucketStats[]
  strategies: string[]
  instruments: string[]
  timezone: string
  records: AnalyticsRecords
  pnlDistribution: PnlDistributionBucket[]
  /** Same PnlDistributionBucket shape, but bucketed by R so account size does not skew it. */
  rDistribution: PnlDistributionBucket[]
  comparison: PeriodComparison | null
  topWinners: TopTradeEntry[]
  topLosers: TopTradeEntry[]
  extremes: TradeExtremes
  maxDrawdownEpisode: MaxDrawdownEpisode | null
  /** Rolling 20-trade expectancy in R, downsampled — watch for edge decay. */
  rollingEdge: RollingEdgePoint[]
  /** Present when the server capped the fetch. */
  meta?: { truncated: boolean; fetched: number; limit: number }
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isClosed(trade: AnalyticsTrade): trade is AnalyticsTrade & { net_pnl: number } {
  return typeof trade.net_pnl === "number"
}

function getHoldTimeMs(trade: AnalyticsTrade): number | null {
  const entry = toDate(trade.entry_date)
  const exit = toDate(trade.exit_date)
  if (!entry || !exit) return null
  const ms = Math.abs(exit.getTime() - entry.getTime())
  return ms
}

export function getTradeHoldTimeMs(trade: {
  entry_date: string | Date
  exit_date?: string | Date | null
}): number | null {
  return getHoldTimeMs(trade as AnalyticsTrade)
}

function averageMs(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function formatHoldDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—"
  if (ms === 0) return "<1m"

  const totalMinutes = Math.max(1, Math.round(ms / 60_000))
  if (totalMinutes < 60) return `${totalMinutes}m`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`

  const days = Math.floor(hours / 24)
  const remHours = hours % 24
  return remHours ? `${days}d ${remHours}h` : `${days}d`
}

/** Profit factor is null when no losing trade exists yet — that reads as infinite, not zero. */
export function formatProfitFactor(value: number | null | undefined, digits = 2): string {
  if (value == null) return "∞"
  if (!Number.isFinite(value)) return "—"
  return value.toFixed(digits)
}

/** R multiples read better signed: +1.80R / -1.00R. */
export function formatR(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}R`
}

function formatDayLabel(dateKey: string, timezone: string): string {
  const parsed = new Date(`${dateKey}T12:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return dateKey
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
  }).format(parsed)
}

function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function getTradeCloseAnchor(trade: AnalyticsTrade): Date | null {
  return toDate(trade.exit_date) ?? toDate(trade.entry_date)
}

/** Monday yyyy-MM-dd for a calendar day key (already in user timezone). */
function mondayKeyFromDay(day: string, timezone: string): string {
  const anchor = new Date(`${day}T12:00:00.000Z`)
  if (Number.isNaN(anchor.getTime())) return day
  const weekday = normalizeWeekday(getZonedParts(anchor, timezone).weekday)
  const dayOffset = WEEKDAY_ORDER.indexOf(weekday as (typeof WEEKDAY_ORDER)[number])
  if (dayOffset < 0) return day

  const [y, m, d] = day.split("-").map(Number)
  const mondayUtc = Date.UTC(y, m - 1, d) - dayOffset * 86_400_000
  const monday = new Date(mondayUtc)
  return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, "0")}-${String(monday.getUTCDate()).padStart(2, "0")}`
}

function calendarWeeksSpan(dayKeys: string[]): number {
  if (!dayKeys.length) return 0
  const sorted = [...dayKeys].sort()
  const [y1, m1, d1] = sorted[0].split("-").map(Number)
  const [y2, m2, d2] = sorted[sorted.length - 1].split("-").map(Number)
  const spanDays = Math.max(
    1,
    Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000) + 1,
  )
  return Math.max(1, spanDays / 7)
}

function formatWeekLabel(mondayKey: string): string {
  const [y, m, d] = mondayKey.split("-").map(Number)
  const start = new Date(y, m - 1, d)
  const end = new Date(y, m - 1, d + 6)
  const fmt = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

function formatMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m)) return monthKey
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  )
}

function compoundReturnPct(values: number[]): number | null {
  if (!values.length) return null
  const product = values.reduce((acc, r) => acc * (1 + r / 100), 1)
  return Math.round((product - 1) * 10000) / 100
}

function buildMonthlyBucket(
  key: string,
  label: string,
  bucket: BucketAccumulator,
  returns: number[],
): MonthlyBucket {
  const base = buildWeeklyBucket(key, label, bucket)
  return {
    ...base,
    returnPct: compoundReturnPct(returns),
    returnTrades: returns.length,
  }
}

function buildWeeklyBucket(key: string, label: string, bucket: BucketAccumulator): WeeklyBucket {
  const base = buildBucket(key, label, bucket)
  const pnls = bucket.pnls
  const grossProfit = pnls.filter((p) => p > 0).reduce((sum, p) => sum + p, 0)
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((sum, p) => sum + p, 0))
  return { ...base, grossProfit, grossLoss }
}

type DistributionDef = { label: string; min: number; max: number }

// Open-ended bounds never leave this module — Infinity would not survive JSON.
const PNL_DISTRIBUTION_DEFS: DistributionDef[] = [
  { label: "< -$250", min: Number.NEGATIVE_INFINITY, max: -250 },
  { label: "-$250 to -$100", min: -250, max: -100 },
  { label: "-$100 to -$50", min: -100, max: -50 },
  { label: "-$50 to $0", min: -50, max: 0 },
  { label: "$0 to $50", min: 0, max: 50 },
  { label: "$50 to $100", min: 50, max: 100 },
  { label: "$100 to $250", min: 100, max: 250 },
  { label: "> $250", min: 250, max: Number.POSITIVE_INFINITY },
]

const R_DISTRIBUTION_DEFS: DistributionDef[] = R_BUCKET_DEFINITIONS.map((def) => ({
  label: def.bucket,
  min: def.min,
  max: def.max,
}))

/** Single pass over the sample; defs must be contiguous and ascending, which both sets above are. */
function bucketize(
  defs: DistributionDef[],
  values: number[],
  pnls: number[],
): PnlDistributionBucket[] {
  const counts = defs.map(() => 0)
  const sums = defs.map(() => 0)

  for (let i = 0; i < values.length; i++) {
    const value = values[i]
    if (!Number.isFinite(value)) continue
    let index = defs.length - 1
    for (let d = 0; d < defs.length - 1; d++) {
      if (value < defs[d].max) {
        index = d
        break
      }
    }
    counts[index] += 1
    sums[index] += pnls[i] ?? 0
  }

  return defs.map((def, d) => ({
    bucket: String(d),
    label: def.label,
    count: counts[d],
    netPnl: sums[d],
  }))
}

function computePnlDistribution(closed: Array<AnalyticsTrade & { net_pnl: number }>): PnlDistributionBucket[] {
  const pnls = closed.map((trade) => trade.net_pnl)
  return bucketize(PNL_DISTRIBUTION_DEFS, pnls, pnls)
}

function computeRDistribution(
  closed: Array<AnalyticsTrade & { net_pnl: number }>,
  sample: RMultipleSample,
): PnlDistributionBucket[] {
  const values: number[] = []
  const pnls: number[] = []
  for (let i = 0; i < sample.values.length; i++) {
    const value = sample.values[i]
    if (value === null) continue
    values.push(value)
    pnls.push(closed[i].net_pnl)
  }
  return bucketize(R_DISTRIBUTION_DEFS, values, pnls)
}

export function computePeriodComparison(
  current: AnalyticsResult["overview"],
  previous: Partial<AnalyticsResult["overview"]> | null,
  label: string,
): PeriodComparison | null {
  if (!previous || !previous.closedTrades) return null
  const prevPf = previous.profitFactor
  const prevExpectancyR = previous.r?.expectancyR
  return {
    netPnlDelta: current.netPnl - (previous.netPnl ?? 0),
    winRateDelta: current.winRate - (previous.winRate ?? 0),
    closedTradesDelta: current.closedTrades - previous.closedTrades,
    profitFactorDelta:
      current.profitFactor !== null && typeof prevPf === "number"
        ? current.profitFactor - prevPf
        : null,
    expectancyDelta:
      typeof previous.expectancy === "number" ? current.expectancy - previous.expectancy : 0,
    avgRDelta:
      typeof prevExpectancyR === "number" && typeof current.r?.expectancyR === "number"
        ? current.r.expectancyR - prevExpectancyR
        : null,
    maxDrawdownPctDelta:
      typeof previous.maxDrawdownPct === "number"
        ? current.maxDrawdownPct - previous.maxDrawdownPct
        : 0,
    label,
  }
}

function sortByExitDate(closed: Array<AnalyticsTrade & { net_pnl: number }>) {
  return [...closed].sort((a, b) => {
    const da = toDate(a.exit_date) ?? toDate(a.entry_date)!
    const db = toDate(b.exit_date) ?? toDate(b.entry_date)!
    return da.getTime() - db.getTime()
  })
}

function buildStreakEpisode(
  sorted: Array<AnalyticsTrade & { net_pnl: number }>,
  startIdx: number,
  endIdx: number,
): StreakEpisode | null {
  if (startIdx < 0 || endIdx < startIdx) return null
  const slice = sorted.slice(startIdx, endIdx + 1)
  if (!slice.length) return null
  return {
    count: slice.length,
    totalPnl: slice.reduce((sum, trade) => sum + trade.net_pnl, 0),
    trades: slice.map(toTopTradeEntry),
  }
}

function computeStreaks(closed: Array<AnalyticsTrade & { net_pnl: number }>): {
  currentStreak: StreakInfo
  bestWinStreak: number
  worstLossStreak: number
  bestWinStreakEpisode: StreakEpisode | null
  worstLossStreakEpisode: StreakEpisode | null
} {
  const sorted = sortByExitDate(closed)

  let bestWinStreak = 0
  let worstLossStreak = 0
  let runWin = 0
  let runLoss = 0
  let runWinStart = 0
  let runLossStart = 0
  let bestWinStart = -1
  let bestWinEnd = -1
  let worstLossStart = -1
  let worstLossEnd = -1

  for (let i = 0; i < sorted.length; i++) {
    const trade = sorted[i]
    if (trade.net_pnl > 0) {
      if (runWin === 0) runWinStart = i
      runWin += 1
      runLoss = 0
      if (runWin >= bestWinStreak) {
        bestWinStreak = runWin
        bestWinStart = runWinStart
        bestWinEnd = i
      }
    } else if (trade.net_pnl < 0) {
      if (runLoss === 0) runLossStart = i
      runLoss += 1
      runWin = 0
      if (runLoss >= worstLossStreak) {
        worstLossStreak = runLoss
        worstLossStart = runLossStart
        worstLossEnd = i
      }
    } else {
      runWin = 0
      runLoss = 0
    }
  }

  let currentStreak: StreakInfo = { type: "none", count: 0 }
  for (let i = sorted.length - 1; i >= 0; i--) {
    const pnl = sorted[i].net_pnl
    if (currentStreak.type === "none") {
      if (pnl > 0) currentStreak = { type: "win", count: 1 }
      else if (pnl < 0) currentStreak = { type: "loss", count: 1 }
      else continue
      continue
    }
    if (currentStreak.type === "win" && pnl > 0) currentStreak.count += 1
    else if (currentStreak.type === "loss" && pnl < 0) currentStreak.count += 1
    else break
  }

  return {
    currentStreak,
    bestWinStreak,
    worstLossStreak,
    bestWinStreakEpisode: buildStreakEpisode(sorted, bestWinStart, bestWinEnd),
    worstLossStreakEpisode: buildStreakEpisode(sorted, worstLossStart, worstLossEnd),
  }
}

/** Per-bucket P&L plus the R values and risk% of the trades in each bucket. */
type BucketAccumulator = { pnls: number[]; rs: number[]; riskPcts: number[]; commissions: number[] }

const EMPTY_BUCKET: BucketAccumulator = { pnls: [], rs: [], riskPcts: [], commissions: [] }

function sumPnls(bucket: BucketAccumulator): number {
  return bucket.pnls.reduce((sum, pnl) => sum + pnl, 0)
}

function buildBucket(key: string, label: string, bucket: BucketAccumulator): BucketStats {
  const { pnls, rs, riskPcts, commissions } = bucket
  const wins = pnls.filter((p) => p > 0).length
  const losses = pnls.filter((p) => p < 0).length
  const netPnl = pnls.reduce((s, p) => s + p, 0)
  const trades = pnls.length
  const commission = commissions.reduce((s, c) => s + c, 0)
  const bucketGrossProfit = pnls.reduce((s, p) => (p > 0 ? s + p : s), 0)
  return {
    key,
    label,
    trades,
    wins,
    losses,
    winRate: trades ? (wins / trades) * 100 : 0,
    netPnl,
    avgPnl: trades ? netPnl / trades : 0,
    avgR: rs.length ? rs.reduce((s, value) => s + value, 0) / rs.length : null,
    rTrades: rs.length,
    riskPctAvg: riskPcts.length
      ? riskPcts.reduce((s, v) => s + v, 0) / riskPcts.length
      : null,
    commission,
    feeDragPct: commission > 0 && bucketGrossProfit > 0 ? commission / bucketGrossProfit : null,
  }
}


const TOP_TRADES_LIMIT = 10

function toTopTradeEntry(trade: AnalyticsTrade & { net_pnl: number }): TopTradeEntry {
  const entry = toDate(trade.entry_date)
  const exit = toDate(trade.exit_date)
  return {
    id: trade._id != null ? String(trade._id) : "",
    instrument: trade.instrument?.trim() || "Unknown",
    trade_type: trade.trade_type || "Buy",
    signal: trade.signal ?? null,
    strategy: trade.strategy ?? null,
    entry_date: entry?.toISOString() ?? String(trade.entry_date),
    exit_date: exit?.toISOString() ?? null,
    entry_price: trade.entry_price ?? null,
    exit_price: trade.exit_price ?? null,
    net_pnl: trade.net_pnl,
    return_pct: trade.return_pct ?? null,
  }
}

function computeTopTrades(closed: Array<AnalyticsTrade & { net_pnl: number }>) {
  const winners = closed
    .filter((trade) => trade.net_pnl > 0)
    .sort((a, b) => b.net_pnl - a.net_pnl)
    .slice(0, TOP_TRADES_LIMIT)
    .map(toTopTradeEntry)

  const losers = closed
    .filter((trade) => trade.net_pnl < 0)
    .sort((a, b) => a.net_pnl - b.net_pnl)
    .slice(0, TOP_TRADES_LIMIT)
    .map(toTopTradeEntry)

  const maxWin = winners[0]?.net_pnl ?? 0
  const maxLoss = losers[0]?.net_pnl ?? 0

  return { topWinners: winners, topLosers: losers, extremes: { maxWin, maxLoss } }
}

function buildMaxDrawdownReason(
  trades: TopTradeEntry[],
  amount: number,
  losses: TopTradeEntry[],
  lossSum: number,
): string {
  if (!trades.length) {
    return "Equity fell from its prior peak — no individual closed trades were recorded in this stretch."
  }

  const wins = trades.filter((trade) => trade.net_pnl > 0)
  const parts: string[] = [
    `${trades.length} closed trade${trades.length === 1 ? "" : "s"} ran while equity dropped ${amount.toFixed(2)} from the prior peak.`,
  ]

  if (losses.length) {
    parts.push(
      `${losses.length} loser${losses.length === 1 ? "" : "s"} accounted for ${Math.abs(lossSum).toFixed(2)} of that slide.`,
    )
  }
  if (wins.length) {
    parts.push(`${wins.length} winner${wins.length === 1 ? "" : "s"} partially offset the drop but could not restore the peak.`)
  }

  const worst = losses.reduce<TopTradeEntry | null>(
    (best, trade) => (!best || trade.net_pnl < best.net_pnl ? trade : best),
    null,
  )
  if (worst) {
    parts.push(`Biggest single hit: ${worst.instrument} at ${worst.net_pnl.toFixed(2)}.`)
  }

  return parts.join(" ")
}

function computeMaxDrawdownEpisode(
  closed: Array<AnalyticsTrade & { net_pnl: number }>,
  initialCapital: number | null,
): MaxDrawdownEpisode | null {
  if (!closed.length) return null

  const sorted = [...closed].sort((a, b) => {
    const da = toDate(a.exit_date) ?? toDate(a.entry_date)!
    const db = toDate(b.exit_date) ?? toDate(b.entry_date)!
    return da.getTime() - db.getTime()
  })

  const capital = initialCapital ?? 0
  let equity = capital
  let peakEquity = capital
  let peakTradeIdx = -1
  let maxDd = 0
  let maxDdPct = 0
  let troughIdx = 0
  let episodePeakTradeIdx = -1
  let episodePeakEquity = 0
  let episodeTroughEquity = 0

  for (let i = 0; i < sorted.length; i++) {
    equity += sorted[i].net_pnl
    if (equity > peakEquity) {
      peakEquity = equity
      peakTradeIdx = i
    }

    const drawdown = peakEquity - equity
    const drawdownPct = peakEquity > 0 ? (drawdown / peakEquity) * 100 : peakEquity < 0 ? 100 : 0
    if (drawdown > maxDd) {
      maxDd = drawdown
      maxDdPct = drawdownPct
      troughIdx = i
      episodePeakTradeIdx = peakTradeIdx
      episodePeakEquity = peakEquity
      episodeTroughEquity = equity
    }
  }

  if (maxDd <= 0) return null

  const episodeRaw = sorted.slice(episodePeakTradeIdx + 1, troughIdx + 1)
  const episodeTrades = episodeRaw.map(toTopTradeEntry)
  const losses = episodeTrades.filter((trade) => trade.net_pnl < 0)
  const lossSum = losses.reduce((sum, trade) => sum + trade.net_pnl, 0)

  const peakDate =
    episodePeakTradeIdx >= 0
      ? (toDate(sorted[episodePeakTradeIdx].exit_date) ??
          toDate(sorted[episodePeakTradeIdx].entry_date))!.toISOString()
      : null
  const troughDate = (toDate(sorted[troughIdx].exit_date) ??
    toDate(sorted[troughIdx].entry_date))!.toISOString()

  // Duration: peak to trough in calendar days
  const peakDt = peakDate ? new Date(peakDate) : null
  const troughDt = new Date(troughDate)
  const durationDays = peakDt
    ? Math.round((troughDt.getTime() - peakDt.getTime()) / 86_400_000)
    : 0

  // Recovery: first trade after trough where equity >= episodePeakEquity
  let recoveryDate: string | null = null
  let recoveryDays: number | null = null
  let recovered = false
  let runningEquity = episodeTroughEquity
  for (let i = troughIdx + 1; i < sorted.length; i++) {
    runningEquity += sorted[i].net_pnl
    if (runningEquity >= episodePeakEquity) {
      const rDate = toDate(sorted[i].exit_date) ?? toDate(sorted[i].entry_date)!
      recoveryDate = rDate.toISOString()
      recoveryDays = Math.round((rDate.getTime() - troughDt.getTime()) / 86_400_000)
      recovered = true
      break
    }
  }

  return {
    amount: maxDd,
    amountPct: maxDdPct,
    peakDate,
    troughDate,
    peakEquity: episodePeakEquity,
    troughEquity: episodeTroughEquity,
    reason: buildMaxDrawdownReason(episodeTrades, maxDd, losses, lossSum),
    trades: episodeTrades,
    durationDays,
    recoveryDate,
    recoveryDays,
    recovered,
  }
}

function computeEquityCurve(
  closed: Array<AnalyticsTrade & { net_pnl: number }>,
  initialCapital: number | null,
): EquityPoint[] {
  const sorted = [...closed].sort((a, b) => {
    const da = toDate(a.exit_date) ?? toDate(a.entry_date)!
    const db = toDate(b.exit_date) ?? toDate(b.entry_date)!
    return da.getTime() - db.getTime()
  })

  const capital = initialCapital ?? 0
  let cumPnl = 0
  let peak = capital
  const points: EquityPoint[] = []

  for (const trade of sorted) {
    cumPnl += trade.net_pnl
    const equity = capital + cumPnl
    if (equity > peak) peak = equity
    const drawdown = peak - equity
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : peak < 0 ? 100 : 0
    const date = (toDate(trade.exit_date) ?? toDate(trade.entry_date))!.toISOString()
    points.push({ date, equity, drawdown, drawdownPct })
  }

  return points
}

export function computeAnalytics(
  trades: AnalyticsTrade[],
  options: {
    timezone?: string
    minBucketTrades?: number
    initialCapital?: number | null
    /** Keep only trades whose close anchor falls in this local calendar window. */
    attribution?: { startDate?: string | null; endDate?: string | null; lookbackDays?: number }
  } = {},
): AnalyticsResult {
  const timezone = options.timezone || "UTC"
  const minTrades = options.minBucketTrades ?? MIN_BUCKET_TRADES

  const fetchedClosed = trades.filter(isClosed)
  const openTrades = trades.length - fetchedClosed.length

  const windowStart = options.attribution?.startDate
    ? localDayStartUtc(options.attribution.startDate, timezone)
    : null
  const windowEnd = options.attribution?.endDate
    ? localDayEndUtc(options.attribution.endDate, timezone)
    : null

  const closed =
    windowStart || windowEnd
      ? fetchedClosed.filter((trade) => {
          const anchor = getTradeCloseAnchor(trade)
          if (!anchor) return false
          if (windowStart && anchor < windowStart) return false
          if (windowEnd && anchor >= windowEnd) return false
          return true
        })
      : fetchedClosed

  const wins = closed.filter((t) => t.net_pnl > 0)
  const losses = closed.filter((t) => t.net_pnl < 0)
  const breakEven = closed.filter((t) => t.net_pnl === 0)

  const grossProfit = wins.reduce((s, t) => s + t.net_pnl, 0)
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.net_pnl, 0))
  const netPnl = closed.reduce((s, t) => s + t.net_pnl, 0)
  const totalCommission = closed.reduce((s, t) => s + (t.commission ?? 0), 0)
  const returnPcts = closed.filter((t) => typeof t.return_pct === "number").map((t) => t.return_pct!)
  const avgReturnPct = returnPcts.length
    ? returnPcts.reduce((s, r) => s + r, 0) / returnPcts.length
    : 0
  const initialCapital =
    typeof options.initialCapital === "number" && options.initialCapital > 0
      ? options.initialCapital
      : null
  const returnPct = initialCapital ? (netPnl / initialCapital) * 100 : null

  const equityCurve = computeEquityCurve(closed, initialCapital)
  const maxDrawdownEpisode = computeMaxDrawdownEpisode(closed, initialCapital)
  const maxDrawdown = maxDrawdownEpisode?.amount ?? 0
  const maxDrawdownPct = maxDrawdownEpisode?.amountPct ?? 0
  const recoveryFactor = maxDrawdown > 0 ? netPnl / maxDrawdown : null

  const rSample = toRMultiples(closed)

  // Per-trade risk % aligned to closed[] — used in buckets and RiskPlanSummary
  const riskPerTrade = closed.map((trade) => {
    const entry = Number(trade.entry_price)
    const stop = Number(trade.stop_loss)
    const size = Number(trade.quantity)
    if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || stop <= 0) return null
    const instrument = resolveTradeSpec(trade)
    const risk = calculateRisk({
      entryPrice: entry,
      stopLoss: stop,
      size: Number.isFinite(size) && size > 0 ? size : 1,
      instrument,
    })
    if (risk.amount === null) return null
    const balance =
      typeof trade.account_balance === "number" && trade.account_balance > 0
        ? trade.account_balance
        : initialCapital
    if (!balance) return null
    return { riskAmount: risk.amount, riskPct: (risk.amount / balance) * 100 }
  })

  const hourMap = new Map<number, BucketAccumulator>()
  const weekdayMap = new Map<string, BucketAccumulator>()
  const monthMap = new Map<string, BucketAccumulator>()
  const monthReturnMap = new Map<string, number[]>()
  const sessionMap = new Map<string, BucketAccumulator>()
  const dayMap = new Map<string, BucketAccumulator>()
  const weekMap = new Map<string, BucketAccumulator>()
  const strategyMap = new Map<string, BucketAccumulator>()
  const signalMap = new Map<string, BucketAccumulator>()
  const instrumentMap = new Map<string, BucketAccumulator>()

  const push = (
    map: Map<string | number, BucketAccumulator>,
    key: string | number,
    pnl: number,
    r: number | null,
    riskPct: number | null,
    commission: number,
  ) => {
    let bucket = map.get(key)
    if (!bucket) {
      bucket = { pnls: [], rs: [], riskPcts: [], commissions: [] }
      map.set(key, bucket)
    }
    bucket.pnls.push(pnl)
    if (r !== null) bucket.rs.push(r)
    if (riskPct !== null) bucket.riskPcts.push(riskPct)
    if (commission !== 0) bucket.commissions.push(commission)
  }

  let longTrades = 0
  let shortTrades = 0
  let longPnl = 0
  let shortPnl = 0

  for (let index = 0; index < closed.length; index++) {
    const trade = closed[index]
    const closeAnchor = getTradeCloseAnchor(trade)
    if (!closeAnchor) continue

    const r = rSample.values[index] ?? null
    const riskPct = riskPerTrade[index]?.riskPct ?? null
    const commission = trade.commission ?? 0
    const entry = toDate(trade.entry_date)
    const closeParts = getZonedParts(closeAnchor, timezone)

    if (entry) {
      const { hour, minute, weekday } = getZonedParts(entry, timezone)
      const session = classifySession(hour, minute)
      const wd = normalizeWeekday(weekday)
      push(hourMap, hour, trade.net_pnl, r, riskPct, commission)
      push(weekdayMap, wd, trade.net_pnl, r, riskPct, commission)
      push(sessionMap, session, trade.net_pnl, r, riskPct, commission)
    }

    push(dayMap, closeParts.day, trade.net_pnl, r, riskPct, commission)
    push(weekMap, mondayKeyFromDay(closeParts.day, timezone), trade.net_pnl, r, riskPct, commission)
    push(monthMap, closeParts.month, trade.net_pnl, r, riskPct, commission)
    if (typeof trade.return_pct === "number" && Number.isFinite(trade.return_pct)) {
      if (!monthReturnMap.has(closeParts.month)) monthReturnMap.set(closeParts.month, [])
      monthReturnMap.get(closeParts.month)!.push(trade.return_pct)
    }

    const strategy = trade.strategy?.trim() || "Unknown"
    const signal = trade.signal?.trim() || "—"
    const instrument = trade.instrument?.trim() || "Unknown"
    push(strategyMap, strategy, trade.net_pnl, r, riskPct, commission)
    push(signalMap, signal, trade.net_pnl, r, riskPct, commission)
    push(instrumentMap, instrument, trade.net_pnl, r, riskPct, commission)

    if (trade.trade_type === "Buy") {
      longTrades += 1
      longPnl += trade.net_pnl
    } else {
      shortTrades += 1
      shortPnl += trade.net_pnl
    }
  }

  const byHour = Array.from({ length: 24 }, (_, h) =>
    buildBucket(String(h), `${String(h).padStart(2, "0")}:00`, hourMap.get(h) ?? EMPTY_BUCKET),
  )

  const byWeekday = WEEKDAY_ORDER.map((wd) =>
    buildBucket(wd, wd, weekdayMap.get(wd) ?? EMPTY_BUCKET),
  )

  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) =>
      buildMonthlyBucket(month, formatMonthLabel(month), bucket, monthReturnMap.get(month) ?? []),
    )

  const byWeek = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, bucket]) => buildWeeklyBucket(weekKey, formatWeekLabel(weekKey), bucket))

  const bySession = SESSION_ORDER.map((s) =>
    buildBucket(s, SESSION_DETAIL_LABELS[s], sessionMap.get(s) ?? EMPTY_BUCKET),
  )

  const byStrategy = [...strategyMap.entries()]
    .map(([k, bucket]) => buildBucket(k, k, bucket))
    .sort((a, b) => b.netPnl - a.netPnl)

  const bySignal = [...signalMap.entries()]
    .map(([k, bucket]) => buildBucket(k, k, bucket))
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 15)

  const byInstrument = [...instrumentMap.entries()]
    .map(([k, bucket]) => buildBucket(k, k, bucket))
    .sort((a, b) => b.netPnl - a.netPnl)

  const byPnlDesc = (a: [string, BucketAccumulator], b: [string, BucketAccumulator]) =>
    sumPnls(b[1]) - sumPnls(a[1])
  const byPnlAsc = (a: [string, BucketAccumulator], b: [string, BucketAccumulator]) =>
    sumPnls(a[1]) - sumPnls(b[1])

  const bestDayEntry = [...dayMap.entries()].sort(byPnlDesc)[0]
  const worstDayEntry = [...dayMap.entries()].sort(byPnlAsc)[0]

  const bestMonthEntry = [...monthMap.entries()].sort(byPnlDesc)[0]
  const worstMonthEntry = [...monthMap.entries()].sort(byPnlAsc)[0]

  const strategies = [...new Set(trades.map((t) => t.strategy?.trim()).filter(Boolean))] as string[]
  const instruments = [...new Set(trades.map((t) => t.instrument?.trim()).filter(Boolean))] as string[]

  const holdTimes = closed
    .map(getHoldTimeMs)
    .filter((ms): ms is number => ms !== null)
  const winHoldTimes = wins
    .map(getHoldTimeMs)
    .filter((ms): ms is number => ms !== null)
  const lossHoldTimes = losses
    .map(getHoldTimeMs)
    .filter((ms): ms is number => ms !== null)

  const streaks = computeStreaks(closed)
  const { topWinners, topLosers, extremes } = computeTopTrades(closed)
  const bestDayPnl = bestDayEntry ? sumPnls(bestDayEntry[1]) : 0
  const worstDayPnl = worstDayEntry ? sumPnls(worstDayEntry[1]) : 0

  const tradesPerDayCounts = [...dayMap.values()].map((bucket) => bucket.pnls.length)
  const datedTrades = tradesPerDayCounts.reduce((sum, count) => sum + count, 0)
  const tradingDays = tradesPerDayCounts.length
  const avgTradesPerDay = tradingDays ? datedTrades / tradingDays : 0
  const avgProfitPerDay = tradingDays ? netPnl / tradingDays : 0
  const medianTradesPerDay = median(tradesPerDayCounts)
  const minTradesPerDay = tradingDays ? Math.min(...tradesPerDayCounts) : 0
  const maxTradesPerDay = tradingDays ? Math.max(...tradesPerDayCounts) : 0
  const calendarWeeks = calendarWeeksSpan([...dayMap.keys()])
  const avgTradesPerWeek = calendarWeeks > 0 ? datedTrades / calendarWeeks : 0
  const accountWinRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const zoneThresholds = computeZoneThresholds({ winRate: accountWinRate })

  let longestHoldMs: number | null = null
  let shortestHoldMs: number | null = null
  for (const ms of holdTimes) {
    if (longestHoldMs === null || ms > longestHoldMs) longestHoldMs = ms
    if (shortestHoldMs === null || ms < shortestHoldMs) shortestHoldMs = ms
  }

  // Share of calendar days that ended below the running equity peak. Non-trading
  // days inherit the previous trading day's state, so each day is owned by the
  // trading day that precedes it.
  let underwaterDayPct: number | null = null
  const sortedDays = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b))
  if (sortedDays.length >= 2) {
    const capital = initialCapital ?? 0
    let runningEquity = capital
    let runningPeak = capital
    let underwaterDays = 0
    let totalDays = 0
    for (let k = 0; k < sortedDays.length; k++) {
      runningEquity += sumPnls(sortedDays[k][1])
      if (runningEquity > runningPeak) runningPeak = runningEquity
      const nextKey = sortedDays[k + 1]?.[0]
      const ownDays = nextKey
        ? Math.round(
            (Date.parse(`${nextKey}T00:00:00Z`) - Date.parse(`${sortedDays[k][0]}T00:00:00Z`)) /
              86_400_000,
          )
        : 1
      totalDays += ownDays
      if (runningEquity < runningPeak) underwaterDays += ownDays
    }
    underwaterDayPct = totalDays > 0 ? (underwaterDays / totalDays) * 100 : null
  }

  const attributionSummary: AttributionSummary = {
    mode: windowStart || windowEnd ? "exit" : "entry",
    windowStart: windowStart ? windowStart.toISOString() : null,
    windowEnd: windowEnd ? windowEnd.toISOString() : null,
    lookbackDays: options.attribution?.lookbackDays ?? 0,
    dropped: fetchedClosed.length - closed.length,
    maxHoldTimeMs: longestHoldMs,
  }

  const rStats = summarizeRMultiples(rSample)
  const rSummary: RMultipleSummary | null = rStats.sampleSize
    ? {
        method: rStats.method,
        sampleSize: rStats.sampleSize,
        stopLossSampleSize: rStats.stopLossSampleSize,
        coverage: rStats.sampleSize / closed.length,
        avgWinR: rStats.avgWinR,
        avgLossR: rStats.avgLossR,
        expectancyR: rStats.expectancyR,
        avgRrRatio: rStats.avgRrRatio,
      }
    : null

  // RiskPlanSummary: per-trade risk %, outcome classification, planned RR
  const riskPctValues: number[] = []
  const riskAmounts: number[] = []
  let plannedRrSum = 0
  let plannedRrCount = 0
  let realizedRrSum = 0
  let realizedRrCount = 0
  let targetHit = 0
  let stopHit = 0
  let manualClose = 0
  let outcomeUnknown = 0
  let hasAccountBalance = false
  let hasInitialCapitalBasis = false

  for (let i = 0; i < closed.length; i++) {
    const trade = closed[i]
    const riskData = riskPerTrade[i]
    if (riskData) {
      riskPctValues.push(riskData.riskPct)
      riskAmounts.push(riskData.riskAmount)
      if (typeof trade.account_balance === "number" && trade.account_balance > 0)
        hasAccountBalance = true
      else hasInitialCapitalBasis = true

      const entry = Number(trade.entry_price)
      const stop = Number(trade.stop_loss)
      const target = Number(trade.target)
      const exitP = Number(trade.exit_price)
      const isBuy = trade.trade_type !== "Sell"

      // Planned RR from entry/stop/target geometry
      if (Number.isFinite(target) && target > 0 && entry > 0 && stop > 0) {
        const riskDist = Math.abs(entry - stop)
        const rewardDist = Math.abs(target - entry)
        if (riskDist > 0) {
          plannedRrSum += rewardDist / riskDist
          plannedRrCount++
        }
        // Outcome: direction-aware with eps
        const eps = Math.max(Math.abs(entry) * 0.001, 0)
        if (Number.isFinite(exitP) && exitP > 0) {
          if (isBuy) {
            if (exitP >= target - eps) targetHit++
            else if (exitP <= stop + eps) stopHit++
            else manualClose++
          } else {
            if (exitP <= target + eps) targetHit++
            else if (exitP >= stop - eps) stopHit++
            else manualClose++
          }
        } else {
          outcomeUnknown++
        }
      } else if (Number.isFinite(exitP) && exitP > 0) {
        // Have stop but no target — can't classify outcome vs target
        outcomeUnknown++
      }

      // Realized RR = netPnl / riskAmount
      const rr = calculateRR(trade.net_pnl, riskData.riskAmount)
      if (rr !== null) {
        realizedRrSum += rr
        realizedRrCount++
      }
    } else {
      // No risk data (missing stop or entry) — outcome unknown if we have the fields
      const stop = Number(trade.stop_loss)
      const target = Number(trade.target)
      const entry = Number(trade.entry_price)
      const exitP = Number(trade.exit_price)
      const isBuy = trade.trade_type !== "Sell"
      if (Number.isFinite(stop) && stop > 0 && Number.isFinite(target) && target > 0 && Number.isFinite(entry) && entry > 0 && Number.isFinite(exitP) && exitP > 0) {
        const eps = Math.max(Math.abs(entry) * 0.001, 0)
        if (isBuy) {
          if (exitP >= target - eps) targetHit++
          else if (exitP <= stop + eps) stopHit++
          else manualClose++
        } else {
          if (exitP <= target + eps) targetHit++
          else if (exitP >= stop - eps) stopHit++
          else manualClose++
        }
      } else {
        outcomeUnknown++
      }
    }
  }

  const totalWithStop = riskPerTrade.filter((r) => r !== null).length
  const totalWithTarget = closed.filter(
    (t) => Number.isFinite(Number(t.target)) && Number(t.target) > 0,
  ).length

  let riskPlan: RiskPlanSummary | null = null
  if (totalWithStop > 0 || plannedRrCount > 0) {
    const sorted = [...riskPctValues].sort((a, b) => a - b)
    const p10 = sorted.length ? sorted[Math.floor(sorted.length * 0.1)] ?? null : null
    const p90 = sorted.length ? sorted[Math.min(Math.floor(sorted.length * 0.9), sorted.length - 1)] ?? null : null
    const knownOutcomes = targetHit + stopHit + manualClose
    riskPlan = {
      coverage: closed.length ? totalWithStop / closed.length : 0,
      targetCoverage: closed.length ? totalWithTarget / closed.length : 0,
      riskedTotal: riskAmounts.reduce((s, v) => s + v, 0),
      avgRiskPct: riskPctValues.length
        ? riskPctValues.reduce((s, v) => s + v, 0) / riskPctValues.length
        : null,
      medianRiskPct: sorted.length
        ? sorted.length % 2
          ? sorted[Math.floor(sorted.length / 2)]
          : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : null,
      riskPctSpread: p10 !== null && p90 !== null ? p90 - p10 : null,
      riskPctBasis: hasAccountBalance ? "account_balance" : hasInitialCapitalBasis ? "initial_capital" : null,
      outcomes: { targetHit, stopHit, manualClose, unknown: outcomeUnknown },
      plannedRrAvg: plannedRrCount ? plannedRrSum / plannedRrCount : null,
      realizedRrAvg: realizedRrCount ? realizedRrSum / realizedRrCount : null,
      adherencePct: knownOutcomes ? ((targetHit + stopHit) / knownOutcomes) * 100 : null,
      riskPctDistribution: riskPctValues.length >= 5
        ? histogram(riskPctValues, 8).map((h) => ({ label: h.label, count: h.count }))
        : null,
    }
  }

  // Day structure + longest red-day run from the already-built dayMap.
  const dayPnls = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({ key, pnl: sumPnls(bucket) }))
  const profitableDays = dayPnls.filter((d) => d.pnl > 0).length
  const losingDays = dayPnls.filter((d) => d.pnl < 0).length
  const breakEvenDays = dayPnls.filter((d) => d.pnl === 0).length
  const greenSum = dayPnls.reduce((s, d) => (d.pnl > 0 ? s + d.pnl : s), 0)
  const redSum = dayPnls.reduce((s, d) => (d.pnl < 0 ? s + d.pnl : s), 0)
  let longestRedDayRun = 0
  let currentRedRun = 0
  for (const d of dayPnls) {
    if (d.pnl < 0) {
      currentRedRun++
      if (currentRedRun > longestRedDayRun) longestRedDayRun = currentRedRun
    } else {
      currentRedRun = 0
    }
  }
  const dayStructure: DayStructure | null = dayPnls.length
    ? {
        tradingDays: dayPnls.length,
        profitableDays,
        losingDays,
        breakEvenDays,
        profitableDayPct: (profitableDays / dayPnls.length) * 100,
        avgGreenDay: profitableDays ? greenSum / profitableDays : 0,
        avgRedDay: losingDays ? redSum / losingDays : 0,
        longestRedDayRun,
      }
    : null

  // Concentration from the already-sorted topWinners/topLosers.
  const top5Winners = topWinners.slice(0, 5)
  const top5Losers = topLosers.slice(0, 5)
  const top5WinPnl = top5Winners.reduce((s, t) => s + t.net_pnl, 0)
  const top5LossPnl = top5Losers.reduce((s, t) => s + t.net_pnl, 0)
  let largestTrade: TopTradeEntry | null = null
  for (const t of [...topWinners, ...topLosers]) {
    if (!largestTrade || Math.abs(t.net_pnl) > Math.abs(largestTrade.net_pnl)) largestTrade = t
  }
  const totalGrossPnl = grossProfit + grossLoss
  const concentration: ConcentrationSummary | null = closed.length
    ? {
        top5WinShare: grossProfit > 0 ? top5WinPnl / grossProfit : null,
        top5LossShare: grossLoss > 0 ? Math.abs(top5LossPnl) / grossLoss : null,
        largestTradeShare:
          largestTrade && totalGrossPnl > 0 ? Math.abs(largestTrade.net_pnl) / totalGrossPnl : null,
        largestTradeId: largestTrade?.id ?? null,
        top5WinPnl,
        top5LossPnl,
      }
    : null

  // Risk-adjusted ratios from the daily return series (20-day floor for honesty).
  const { returns: dailyReturns, basis: returnBasis } = dailyReturnsFromEquity(
    equityCurve,
    initialCapital,
  )
  const riskRatios: RiskRatios | null =
    dailyReturns.length >= 20
      ? {
          sharpe: sharpe(dailyReturns),
          sortino: sortino(dailyReturns),
          calmar: calmar(netPnl, maxDrawdown),
          ulcer: ulcer(equityCurve),
          basis: returnBasis,
          sampleDays: dailyReturns.length,
        }
      : null

  // Significance over the per-trade R series (falls back to dollar P&L).
  const rValues = rSample.values.filter((v): v is number => v !== null)
  const perfSeries = rValues.length ? rValues : closed.map((t) => t.net_pnl)
  const tStatistic = tStat(perfSeries)
  const winRateFrac = closed.length ? wins.length / closed.length : 0
  const kelly = rStats.sampleSize
    ? kellyFraction(rStats.winRate, rStats.avgWinR, Math.abs(rStats.avgLossR))
    : kellyFraction(winRateFrac, wins.length ? grossProfit / wins.length : 0, losses.length ? grossLoss / losses.length : 0)
  const significance: SignificanceSummary | null =
    closed.length >= 2
      ? {
          tStat: tStatistic,
          significant: tStatistic !== null && Math.abs(tStatistic) >= 2,
          winRateCi: wilsonInterval(wins.length, closed.length),
          kelly,
          halfKelly: kelly !== null ? kelly / 2 : null,
        }
      : null

  // Rolling 20-trade expectancy in R, ordered by close anchor.
  const edgeOrder = closed
    .map((trade, idx) => ({ idx, anchor: getTradeCloseAnchor(trade) }))
    .filter((x): x is { idx: number; anchor: Date } => x.anchor !== null)
    .sort((a, b) => a.anchor.getTime() - b.anchor.getTime())
  const orderedR = edgeOrder.map((x) => rSample.values[x.idx] ?? null)
  const orderedDates = edgeOrder.map((x) => x.anchor.toISOString())
  const rollingEdgeSeries = rollingEdge(orderedR, orderedDates)

  // Fee economics: how much commission the recorded net_pnl does NOT already account for.
  const coveredTrades = closed.filter((t) => (t.commission ?? 0) > 0).length
  const fees: FeeSummary | null =
    coveredTrades > 0 && totalCommission !== 0
      ? {
          total: totalCommission,
          coveredTrades,
          coverage: closed.length ? coveredTrades / closed.length : 0,
          netPnlAsStored: netPnl,
          netPnlAfterFees: netPnl - totalCommission,
          feeDragPct: grossProfit > 0 ? totalCommission / grossProfit : null,
          feePerTrade: totalCommission / coveredTrades,
          feeShareOfEdge: netPnl > 0 ? totalCommission / netPnl : null,
        }
      : null

  return {
    overview: {
      totalTrades: closed.length + openTrades,
      closedTrades: closed.length,
      openTrades,
      wins: wins.length,
      losses: losses.length,
      breakEven: breakEven.length,
      winRate: accountWinRate,
      netPnl,
      grossProfit,
      grossLoss,
      profitFactor:
        grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0,
      expectancy: closed.length ? netPnl / closed.length : 0,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      totalCommission,
      avgReturnPct,
      initialCapital,
      returnPct,
      maxDrawdown,
      maxDrawdownPct,
      recoveryFactor,
      maxDrawdownDurationDays: maxDrawdownEpisode?.durationDays ?? null,
      drawdownRecoveryDate: maxDrawdownEpisode?.recoveryDate ?? null,
      drawdownRecoveryDays: maxDrawdownEpisode?.recoveryDays ?? null,
      underwaterDayPct,
      longTrades,
      shortTrades,
      longPnl,
      shortPnl,
      bestDay: bestDayEntry
        ? { date: bestDayEntry[0], pnl: sumPnls(bestDayEntry[1]) }
        : null,
      worstDay: worstDayEntry
        ? { date: worstDayEntry[0], pnl: sumPnls(worstDayEntry[1]) }
        : null,
      bestMonth: bestMonthEntry
        ? {
            month: formatMonthLabel(bestMonthEntry[0]),
            pnl: sumPnls(bestMonthEntry[1]),
          }
        : null,
      worstMonth: worstMonthEntry
        ? {
            month: formatMonthLabel(worstMonthEntry[0]),
            pnl: sumPnls(worstMonthEntry[1]),
          }
        : null,
      avgHoldTimeMs: averageMs(holdTimes),
      avgHoldTimeWinMs: averageMs(winHoldTimes),
      avgHoldTimeLossMs: averageMs(lossHoldTimes),
      minHoldTimeMs: shortestHoldMs,
      maxHoldTimeMs: longestHoldMs,
      holdTimeTrades: holdTimes.length,
      tradingDays,
      avgTradesPerDay,
      avgProfitPerDay,
      medianTradesPerDay,
      minTradesPerDay,
      maxTradesPerDay,
      calendarWeeks,
      avgTradesPerWeek,
      attribution: attributionSummary,
      r: rSummary,
      riskPlan,
      dayStructure,
      concentration,
      riskRatios,
      significance,
      fees,
    },
    equityCurve,
    byHour,
    byWeekday,
    byMonth,
    byWeek,
    bySession,
    avoid: {
      hours: rankAvoidBuckets(byHour, minTrades, zoneThresholds),
      days: rankAvoidBuckets(byWeekday, minTrades, zoneThresholds),
      sessions: rankAvoidBuckets(bySession, minTrades, zoneThresholds),
      bestHours: rankBestBuckets(byHour, minTrades),
      bestDays: rankBestBuckets(byWeekday, minTrades),
      bestSessions: rankBestBuckets(bySession, minTrades),
    },
    byStrategy,
    bySignal,
    byInstrument,
    strategies,
    instruments,
    timezone,
    records: {
      currentStreak: streaks.currentStreak,
      bestWinStreak: streaks.bestWinStreak,
      worstLossStreak: streaks.worstLossStreak,
      bestWinStreakEpisode: streaks.bestWinStreakEpisode,
      worstLossStreakEpisode: streaks.worstLossStreakEpisode,
      bestDay: bestDayEntry
        ? {
            date: bestDayEntry[0],
            label: formatDayLabel(bestDayEntry[0], timezone),
            pnl: bestDayPnl,
          }
        : null,
      worstDay: worstDayEntry
        ? {
            date: worstDayEntry[0],
            label: formatDayLabel(worstDayEntry[0], timezone),
            pnl: worstDayPnl,
          }
        : null,
      backtestTimeMs: holdTimes.length ? holdTimes.reduce((sum, ms) => sum + ms, 0) : null,
      avgHoldTimeMs: averageMs(holdTimes),
      avgHoldTimeWinMs: averageMs(winHoldTimes),
      avgHoldTimeLossMs: averageMs(lossHoldTimes),
      holdTimeTrades: holdTimes.length,
    },
    pnlDistribution: computePnlDistribution(closed),
    rDistribution: computeRDistribution(closed, rSample),
    comparison: null,
    topWinners,
    topLosers,
    extremes,
    maxDrawdownEpisode,
    rollingEdge: rollingEdgeSeries,
  }
}
