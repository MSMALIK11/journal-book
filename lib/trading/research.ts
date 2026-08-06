import {
  classifySession,
  getZonedParts,
  normalizeWeekday,
  SESSION_LABELS,
  type TradingSession,
  WEEKDAY_ORDER,
} from "@/lib/trading/sessions"
import {
  formatHoldDuration,
  getTradeHoldTimeMs,
  MIN_BUCKET_TRADES,
  type BucketStats,
  type PeriodComparison,
} from "@/lib/trading/analytics"
import { computeAvoidanceImpact, type AvoidanceImpact } from "@/lib/trading/avoidance-impact"

export type ResearchTrade = {
  entry_date: Date | string
  exit_date?: Date | string | null
  net_pnl?: number | null
  return_pct?: number | null
  commission?: number | null
  strategy?: string | null
  instrument?: string | null
  trade_type?: "Buy" | "Sell" | string
  signal?: string | null
  source?: "manual" | "tradingview" | string
  emotion_tag?: string | null
  confidence_rating?: number | null
  followed_plan?: boolean | null
  mistake_tag?: string | null
  tags?: string[] | null
  stop_loss?: number | null
  target?: number | null
  quantity?: number | null
}

export type StyleProfile = {
  holdStyleLabel: string
  medianHoldMs: number | null
  medianHoldLabel: string
  longTrades: number
  shortTrades: number
  longPnl: number
  shortPnl: number
  profitableSide: "long" | "short" | "balanced" | "none"
  busiestSession: string
  busiestSessionTrades: number
  avgTradesPerDay: number
  tradingDays: number
  topInstruments: Array<{ instrument: string; trades: number; netPnl: number }>
  summary: string
  closedTrades: number
  netPnl: number
  winRate: number
}

export type SessionInstrumentRow = {
  instrument: string
  session: string
  sessionLabel: string
  trades: number
  winRate: number
  netPnl: number
  avgPnl: number
}

export type HeatmapCell = {
  hour: number
  weekday: string
  trades: number
  netPnl: number
  winRate: number
}

export type SignalSessionRow = {
  signal: string
  session: string
  sessionLabel: string
  trades: number
  winRate: number
  netPnl: number
}

export type BehaviorStats = {
  baselineWinRate: number
  afterWinNextWinRate: number | null
  afterWinSamples: number
  afterLossNextWinRate: number | null
  afterLossSamples: number
  highDensityDayAvgPnl: number | null
  lowDensityDayAvgPnl: number | null
  highDensityDays: number
  lowDensityDays: number
  avgTradesToRecoverAfterLossDay: number | null
  lossDayRecoverySamples: number
}

export type { AvoidanceImpact, AvoidanceScenario, MistakeBucket, PerformanceSnapshot } from "@/lib/trading/avoidance-impact"
export type { PeriodComparison } from "@/lib/trading/analytics"

export type ResearchRecommendation = {
  type: "edge" | "leak"
  title: string
  detail: string
  metric: string
}

export type ResearchResult = {
  styleProfile: StyleProfile
  patterns: {
    sessionByInstrument: SessionInstrumentRow[]
    holdTimeBuckets: BucketStats[]
    hourHeatmap: HeatmapCell[]
    signalBySession: SignalSessionRow[]
  }
  behavior: BehaviorStats
  journal: {
    byEmotion: BucketStats[]
    byMistake: BucketStats[]
    byFollowedPlan: BucketStats[]
    byConfidence: BucketStats[]
    hasManualJournalData: boolean
  }
  recommendations: ResearchRecommendation[]
  whatIf: AvoidanceImpact | null
  strategies: string[]
  instruments: string[]
  timezone: string
  closedTrades: number
  comparison: PeriodComparison | null
}

type ClosedTrade = ResearchTrade & { net_pnl: number }

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function isClosed(trade: ResearchTrade): trade is ClosedTrade {
  return typeof trade.net_pnl === "number"
}

function buildBucket(key: string, label: string, pnls: number[]): BucketStats {
  const wins = pnls.filter((p) => p > 0).length
  const losses = pnls.filter((p) => p < 0).length
  const netPnl = pnls.reduce((s, p) => s + p, 0)
  const trades = pnls.length
  return {
    key,
    label,
    trades,
    wins,
    losses,
    winRate: trades ? (wins / trades) * 100 : 0,
    netPnl,
    avgPnl: trades ? netPnl / trades : 0,
  }
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function holdStyleLabel(ms: number | null): string {
  if (ms == null) return "Unknown"
  const minutes = ms / 60_000
  if (minutes < 15) return "Scalper"
  if (minutes <= 240) return "Intraday"
  return "Swing"
}

function sortByExit(closed: ClosedTrade[]): ClosedTrade[] {
  return [...closed].sort((a, b) => {
    const da = toDate(a.exit_date) ?? toDate(a.entry_date)!
    const db = toDate(b.exit_date) ?? toDate(b.entry_date)!
    return da.getTime() - db.getTime()
  })
}

function computeStyleProfile(closed: ClosedTrade[], timezone: string): StyleProfile {
  const holdTimes = closed.map(getTradeHoldTimeMs).filter((ms): ms is number => ms !== null)
  const medianHoldMs = median(holdTimes)
  const holdLabel = holdStyleLabel(medianHoldMs)

  let longTrades = 0
  let shortTrades = 0
  let longPnl = 0
  let shortPnl = 0
  const sessionCounts = new Map<TradingSession, number>()
  const instrumentMap = new Map<string, number[]>()
  const daySet = new Set<string>()

  for (const trade of closed) {
    const entry = toDate(trade.entry_date)
    if (entry) {
      const { hour, minute, day } = getZonedParts(entry, timezone)
      const session = classifySession(hour, minute)
      sessionCounts.set(session, (sessionCounts.get(session) ?? 0) + 1)
      daySet.add(day)
    }

    const instrument = trade.instrument?.trim() || "Unknown"
    if (!instrumentMap.has(instrument)) instrumentMap.set(instrument, [])
    instrumentMap.get(instrument)!.push(trade.net_pnl)

    if (trade.trade_type === "Buy") {
      longTrades += 1
      longPnl += trade.net_pnl
    } else {
      shortTrades += 1
      shortPnl += trade.net_pnl
    }
  }

  let busiestSession: TradingSession = "PreAsia"
  let busiestSessionTrades = 0
  for (const [session, count] of sessionCounts) {
    if (count > busiestSessionTrades) {
      busiestSession = session
      busiestSessionTrades = count
    }
  }

  const topInstruments = [...instrumentMap.entries()]
    .map(([instrument, pnls]) => ({
      instrument,
      trades: pnls.length,
      netPnl: pnls.reduce((s, p) => s + p, 0),
    }))
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 3)

  let profitableSide: StyleProfile["profitableSide"] = "none"
  if (longTrades > 0 || shortTrades > 0) {
    if (longPnl > 0 && shortPnl <= 0) profitableSide = "long"
    else if (shortPnl > 0 && longPnl <= 0) profitableSide = "short"
    else if (longPnl > 0 && shortPnl > 0) profitableSide = "balanced"
    else profitableSide = longPnl >= shortPnl ? "long" : "short"
  }

  const tradingDays = daySet.size
  const avgTradesPerDay = tradingDays ? closed.length / tradingDays : 0
  const netPnl = closed.reduce((s, t) => s + t.net_pnl, 0)
  const winRate = closed.length
    ? (closed.filter((t) => t.net_pnl > 0).length / closed.length) * 100
    : 0

  const sideNote =
    profitableSide === "long"
      ? "longs are your stronger side"
      : profitableSide === "short"
        ? "shorts are your stronger side"
        : profitableSide === "balanced"
          ? "both long and short are profitable"
          : "no clear directional edge yet"

  const summary = [
    `You trade like a ${holdLabel.toLowerCase()} (median hold ${formatHoldDuration(medianHoldMs)}).`,
    `Most active in ${SESSION_LABELS[busiestSession]}.`,
    `${sideNote.charAt(0).toUpperCase()}${sideNote.slice(1)}.`,
    `Based on ${closed.length} closed trades across ${tradingDays} active days.`,
  ].join(" ")

  return {
    holdStyleLabel: holdLabel,
    medianHoldMs,
    medianHoldLabel: formatHoldDuration(medianHoldMs),
    longTrades,
    shortTrades,
    longPnl,
    shortPnl,
    profitableSide,
    busiestSession: SESSION_LABELS[busiestSession],
    busiestSessionTrades,
    avgTradesPerDay,
    tradingDays,
    topInstruments,
    summary,
    closedTrades: closed.length,
    netPnl,
    winRate,
  }
}

function computeSessionByInstrument(closed: ClosedTrade[], timezone: string): SessionInstrumentRow[] {
  const map = new Map<string, number[]>()

  for (const trade of closed) {
    const entry = toDate(trade.entry_date)
    if (!entry) continue
    const { hour, minute } = getZonedParts(entry, timezone)
    const session = classifySession(hour, minute)
    const instrument = trade.instrument?.trim() || "Unknown"
    const key = `${instrument}::${session}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(trade.net_pnl)
  }

  return [...map.entries()]
    .map(([key, pnls]) => {
      const [instrument, session] = key.split("::") as [string, TradingSession]
      const bucket = buildBucket(key, `${instrument} · ${SESSION_LABELS[session]}`, pnls)
      return {
        instrument,
        session,
        sessionLabel: SESSION_LABELS[session],
        trades: bucket.trades,
        winRate: bucket.winRate,
        netPnl: bucket.netPnl,
        avgPnl: bucket.avgPnl,
      }
    })
    .filter((row) => row.trades >= MIN_BUCKET_TRADES)
    .sort((a, b) => b.netPnl - a.netPnl)
}

function computeHoldTimeBuckets(closed: ClosedTrade[]): BucketStats[] {
  const buckets = [
    { key: "lt15", label: "< 15 min", min: 0, max: 15 * 60_000 },
    { key: "15m1h", label: "15m – 1h", min: 15 * 60_000, max: 60 * 60_000 },
    { key: "1h4h", label: "1h – 4h", min: 60 * 60_000, max: 4 * 60 * 60_000 },
    { key: "gt4h", label: "4h+", min: 4 * 60 * 60_000, max: Number.POSITIVE_INFINITY },
  ]

  return buckets.map((def) => {
    const pnls = closed
      .map((trade) => getTradeHoldTimeMs(trade))
      .map((ms, i) => ({ ms, pnl: closed[i].net_pnl }))
      .filter((item): item is { ms: number; pnl: number } => item.ms !== null)
      .filter((item) => item.ms >= def.min && (def.max === Number.POSITIVE_INFINITY ? true : item.ms < def.max))
      .map((item) => item.pnl)
    return buildBucket(def.key, def.label, pnls)
  })
}

function computeHourHeatmap(closed: ClosedTrade[], timezone: string): HeatmapCell[] {
  const map = new Map<string, number[]>()

  for (const trade of closed) {
    const entry = toDate(trade.entry_date)
    if (!entry) continue
    const { hour, weekday } = getZonedParts(entry, timezone)
    const wd = normalizeWeekday(weekday)
    const key = `${hour}::${wd}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(trade.net_pnl)
  }

  const cells: HeatmapCell[] = []
  for (const weekday of WEEKDAY_ORDER) {
    for (let hour = 0; hour < 24; hour += 1) {
      const key = `${hour}::${weekday}`
      const pnls = map.get(key) ?? []
      const bucket = buildBucket(key, `${weekday} ${hour}:00`, pnls)
      cells.push({
        hour,
        weekday,
        trades: bucket.trades,
        netPnl: bucket.netPnl,
        winRate: bucket.winRate,
      })
    }
  }
  return cells
}

function computeSignalBySession(closed: ClosedTrade[], timezone: string): SignalSessionRow[] {
  const map = new Map<string, number[]>()

  for (const trade of closed) {
    const signal = trade.signal?.trim() || "—"
    if (signal === "—") continue
    const entry = toDate(trade.entry_date)
    if (!entry) continue
    const { hour, minute } = getZonedParts(entry, timezone)
    const session = classifySession(hour, minute)
    const key = `${signal}::${session}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(trade.net_pnl)
  }

  return [...map.entries()]
    .map(([key, pnls]) => {
      const [signal, session] = key.split("::") as [string, TradingSession]
      const bucket = buildBucket(key, key, pnls)
      return {
        signal,
        session,
        sessionLabel: SESSION_LABELS[session],
        trades: bucket.trades,
        winRate: bucket.winRate,
        netPnl: bucket.netPnl,
      }
    })
    .filter((row) => row.trades >= MIN_BUCKET_TRADES)
    .sort((a, b) => b.netPnl - a.netPnl)
}

function computeBehavior(closed: ClosedTrade[], timezone: string): BehaviorStats {
  const sorted = sortByExit(closed)
  const wins = sorted.filter((t) => t.net_pnl > 0).length
  const baselineWinRate = sorted.length ? (wins / sorted.length) * 100 : 0

  let afterWinWins = 0
  let afterWinTotal = 0
  let afterLossWins = 0
  let afterLossTotal = 0

  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].net_pnl
    const next = sorted[i].net_pnl
    if (prev > 0) {
      afterWinTotal += 1
      if (next > 0) afterWinWins += 1
    } else if (prev < 0) {
      afterLossTotal += 1
      if (next > 0) afterLossWins += 1
    }
  }

  const dayMap = new Map<string, number[]>()
  for (const trade of closed) {
    const entry = toDate(trade.entry_date)
    if (!entry) continue
    const { day } = getZonedParts(entry, timezone)
    if (!dayMap.has(day)) dayMap.set(day, [])
    dayMap.get(day)!.push(trade.net_pnl)
  }

  const highDensityPnls: number[] = []
  const lowDensityPnls: number[] = []
  let highDensityDays = 0
  let lowDensityDays = 0

  for (const pnls of dayMap.values()) {
    const dayPnl = pnls.reduce((s, p) => s + p, 0)
    if (pnls.length >= 3) {
      highDensityDays += 1
      highDensityPnls.push(dayPnl)
    } else {
      lowDensityDays += 1
      lowDensityPnls.push(dayPnl)
    }
  }

  const recoveryCounts: number[] = []
  const days = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (let i = 0; i < days.length; i += 1) {
    const [, pnls] = days[i]
    const dayPnl = pnls.reduce((s, p) => s + p, 0)
    if (dayPnl >= 0) continue

    let cumulative = dayPnl
    let tradesToRecover = 0
    let recovered = false

    for (let j = i; j < days.length && !recovered; j += 1) {
      const dayPnls = j === i ? pnls : days[j][1]
      for (const pnl of j === i ? dayPnls.slice(pnls.length) : dayPnls) {
        tradesToRecover += 1
        cumulative += pnl
        if (cumulative >= 0) {
          recovered = true
          break
        }
      }
      if (!recovered && j > i) {
        for (const pnl of days[j][1]) {
          tradesToRecover += 1
          cumulative += pnl
          if (cumulative >= 0) {
            recovered = true
            break
          }
        }
      }
    }

    if (recovered && tradesToRecover > 0) recoveryCounts.push(tradesToRecover)
  }

  const avgHigh =
    highDensityPnls.length ? highDensityPnls.reduce((s, p) => s + p, 0) / highDensityPnls.length : null
  const avgLow =
    lowDensityPnls.length ? lowDensityPnls.reduce((s, p) => s + p, 0) / lowDensityPnls.length : null
  const avgRecovery =
    recoveryCounts.length
      ? recoveryCounts.reduce((s, n) => s + n, 0) / recoveryCounts.length
      : null

  return {
    baselineWinRate,
    afterWinNextWinRate: afterWinTotal >= MIN_BUCKET_TRADES ? (afterWinWins / afterWinTotal) * 100 : null,
    afterWinSamples: afterWinTotal,
    afterLossNextWinRate:
      afterLossTotal >= MIN_BUCKET_TRADES ? (afterLossWins / afterLossTotal) * 100 : null,
    afterLossSamples: afterLossTotal,
    highDensityDayAvgPnl: highDensityDays > 0 ? avgHigh : null,
    lowDensityDayAvgPnl: lowDensityDays > 0 ? avgLow : null,
    highDensityDays,
    lowDensityDays,
    avgTradesToRecoverAfterLossDay: avgRecovery,
    lossDayRecoverySamples: recoveryCounts.length,
  }
}

function confidenceBin(rating: number | null | undefined): string | null {
  if (rating == null || !Number.isFinite(rating)) return null
  if (rating <= 3) return "Low (1–3)"
  if (rating <= 6) return "Medium (4–6)"
  return "High (7–10)"
}

function computeJournal(closed: ClosedTrade[]) {
  const emotionMap = new Map<string, number[]>()
  const mistakeMap = new Map<string, number[]>()
  const planMap = new Map<string, number[]>()
  const confidenceMap = new Map<string, number[]>()

  let manualJournalCount = 0

  for (const trade of closed) {
    if (trade.source === "manual") manualJournalCount += 1

    const emotion = trade.emotion_tag?.trim()
    if (emotion) {
      if (!emotionMap.has(emotion)) emotionMap.set(emotion, [])
      emotionMap.get(emotion)!.push(trade.net_pnl)
    }

    const mistake = trade.mistake_tag?.trim()
    if (mistake) {
      if (!mistakeMap.has(mistake)) mistakeMap.set(mistake, [])
      mistakeMap.get(mistake)!.push(trade.net_pnl)
    }

    if (trade.followed_plan !== null && trade.followed_plan !== undefined) {
      const key = trade.followed_plan ? "Followed plan" : "Deviated from plan"
      if (!planMap.has(key)) planMap.set(key, [])
      planMap.get(key)!.push(trade.net_pnl)
    }

    const bin = confidenceBin(trade.confidence_rating)
    if (bin) {
      if (!confidenceMap.has(bin)) confidenceMap.set(bin, [])
      confidenceMap.get(bin)!.push(trade.net_pnl)
    }
  }

  const toBuckets = (map: Map<string, number[]>) =>
    [...map.entries()]
      .map(([key, pnls]) => buildBucket(key, key, pnls))
      .sort((a, b) => b.netPnl - a.netPnl)

  const hasManualJournalData =
    emotionMap.size > 0 || mistakeMap.size > 0 || planMap.size > 1 || confidenceMap.size > 0

  return {
    byEmotion: toBuckets(emotionMap),
    byMistake: toBuckets(mistakeMap),
    byFollowedPlan: toBuckets(planMap),
    byConfidence: toBuckets(confidenceMap),
    hasManualJournalData: hasManualJournalData || manualJournalCount > 0,
  }
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)
}

function computeRecommendations(
  closed: ClosedTrade[],
  style: StyleProfile,
  sessionRows: SessionInstrumentRow[],
  holdBuckets: BucketStats[],
  behavior: BehaviorStats,
  timezone: string,
): ResearchRecommendation[] {
  const candidates: ResearchRecommendation[] = []

  for (const row of sessionRows.slice(0, 3)) {
    if (row.netPnl > 0) {
      candidates.push({
        type: "edge",
        title: `${row.instrument} in ${row.sessionLabel}`,
        detail: "Strong session-instrument combination worth repeating.",
        metric: `${formatCurrency(row.netPnl)} · ${row.trades} trades · ${row.winRate.toFixed(0)}% WR`,
      })
    }
  }

  for (const row of [...sessionRows].sort((a, b) => a.netPnl - b.netPnl).slice(0, 2)) {
    if (row.netPnl < 0 && row.trades >= MIN_BUCKET_TRADES) {
      candidates.push({
        type: "leak",
        title: `${row.instrument} in ${row.sessionLabel}`,
        detail: "This combo consistently loses — consider skipping or reducing size.",
        metric: `${formatCurrency(row.netPnl)} · ${row.trades} trades · ${row.winRate.toFixed(0)}% WR`,
      })
    }
  }

  const weekdayMap = new Map<string, number[]>()
  for (const trade of closed) {
    const entry = toDate(trade.entry_date)
    if (!entry) continue
    const { weekday } = getZonedParts(entry, timezone)
    const wd = normalizeWeekday(weekday)
    if (!weekdayMap.has(wd)) weekdayMap.set(wd, [])
    weekdayMap.get(wd)!.push(trade.net_pnl)
  }

  for (const [wd, pnls] of weekdayMap) {
    if (pnls.length < MIN_BUCKET_TRADES) continue
    const bucket = buildBucket(wd, wd, pnls)
    if (bucket.netPnl >= 100) {
      candidates.push({
        type: "edge",
        title: `${wd} trades`,
        detail: "Your best weekday by net P&L.",
        metric: `${formatCurrency(bucket.netPnl)} · ${bucket.winRate.toFixed(0)}% WR`,
      })
    } else if (bucket.netPnl <= -100) {
      candidates.push({
        type: "leak",
        title: `${wd} trades`,
        detail: "Weakest weekday — review setups or reduce activity.",
        metric: `${formatCurrency(bucket.netPnl)} · ${bucket.winRate.toFixed(0)}% WR`,
      })
    }
  }

  for (const bucket of holdBuckets) {
    if (bucket.trades < MIN_BUCKET_TRADES) continue
    if (bucket.netPnl > 0 && bucket.winRate >= 55) {
      candidates.push({
        type: "edge",
        title: `Hold ${bucket.label}`,
        detail: "This hold duration aligns with your winners.",
        metric: `${formatCurrency(bucket.netPnl)} · ${bucket.winRate.toFixed(0)}% WR`,
      })
    } else if (bucket.netPnl < 0) {
      candidates.push({
        type: "leak",
        title: `Hold ${bucket.label}`,
        detail: "Trades in this duration bucket underperform.",
        metric: `${formatCurrency(bucket.netPnl)} · ${bucket.winRate.toFixed(0)}% WR`,
      })
    }
  }

  if (
    behavior.afterLossNextWinRate !== null &&
    behavior.afterLossNextWinRate < behavior.baselineWinRate - 10
  ) {
    candidates.push({
      type: "leak",
      title: "After a loss",
      detail: "Next trade win rate drops — possible revenge trading or tilt.",
      metric: `${behavior.afterLossNextWinRate.toFixed(0)}% vs ${behavior.baselineWinRate.toFixed(0)}% baseline`,
    })
  }

  if (
    behavior.highDensityDayAvgPnl !== null &&
    behavior.lowDensityDayAvgPnl !== null &&
    behavior.highDensityDayAvgPnl < behavior.lowDensityDayAvgPnl - 50
  ) {
    candidates.push({
      type: "leak",
      title: "Overtrading days",
      detail: "Days with 3+ trades underperform vs lighter days.",
      metric: `${formatCurrency(behavior.highDensityDayAvgPnl)} vs ${formatCurrency(behavior.lowDensityDayAvgPnl)} avg/day`,
    })
  }

  if (style.topInstruments[0]?.netPnl > 0) {
    const top = style.topInstruments[0]
    candidates.push({
      type: "edge",
      title: `Top instrument: ${top.instrument}`,
      detail: "Your highest net P&L instrument in this sample.",
      metric: `${formatCurrency(top.netPnl)} · ${top.trades} trades`,
    })
  }

  const edges = candidates.filter((c) => c.type === "edge")
  const leaks = candidates.filter((c) => c.type === "leak")
  return [...edges.slice(0, 3), ...leaks.slice(0, 3)].slice(0, 6)
}

export function computeResearchInsights(
  trades: ResearchTrade[],
  options: { timezone?: string } = {},
): ResearchResult {
  const timezone = options.timezone || "UTC"
  const closed = trades.filter(isClosed)

  const strategies = [...new Set(trades.map((t) => t.strategy?.trim()).filter(Boolean))] as string[]
  const instruments = [...new Set(trades.map((t) => t.instrument?.trim()).filter(Boolean))] as string[]

  const styleProfile = computeStyleProfile(closed, timezone)
  const sessionByInstrument = computeSessionByInstrument(closed, timezone)
  const holdTimeBuckets = computeHoldTimeBuckets(closed)
  const hourHeatmap = computeHourHeatmap(closed, timezone)
  const signalBySession = computeSignalBySession(closed, timezone)
  const behavior = computeBehavior(closed, timezone)
  const journal = computeJournal(closed)
  const recommendations = computeRecommendations(
    closed,
    styleProfile,
    sessionByInstrument,
    holdTimeBuckets,
    behavior,
    timezone,
  )
  const whatIf = computeAvoidanceImpact(closed, { timezone })

  return {
    styleProfile,
    patterns: {
      sessionByInstrument,
      holdTimeBuckets,
      hourHeatmap,
      signalBySession,
    },
    behavior,
    journal,
    recommendations,
    whatIf,
    strategies,
    instruments,
    timezone,
    closedTrades: closed.length,
    comparison: null,
  }
}
