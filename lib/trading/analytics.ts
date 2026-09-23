import { classifySession, getZonedParts, normalizeWeekday, SESSION_DETAIL_LABELS, SESSION_LABELS, SESSION_ORDER, WEEKDAY_ORDER } from "@/lib/trading/sessions"
import {
  computeZoneThresholds,
  rankAvoidBuckets,
  rankBestBuckets,
} from "@/lib/trading/zone-thresholds"

export const MIN_BUCKET_TRADES = 5

export type AnalyticsTrade = {
  _id?: unknown
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

export type BucketStats = {
  key: string
  label: string
  trades: number
  wins: number
  losses: number
  winRate: number
  netPnl: number
  avgPnl: number
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

export type AnalyticsRecords = {
  currentStreak: StreakInfo
  bestWinStreak: number
  worstLossStreak: number
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
  label: string
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
    profitFactor: number
    expectancy: number
    avgWin: number
    avgLoss: number
    totalCommission: number
    avgReturnPct: number
    maxDrawdown: number
    maxDrawdownPct: number
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
    holdTimeTrades: number
    tradingDays: number
    avgTradesPerDay: number
    medianTradesPerDay: number
    minTradesPerDay: number
    maxTradesPerDay: number
    calendarWeeks: number
    avgTradesPerWeek: number
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
  comparison: PeriodComparison | null
  topWinners: TopTradeEntry[]
  topLosers: TopTradeEntry[]
  extremes: TradeExtremes
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
  pnls: number[],
  returns: number[],
): MonthlyBucket {
  const base = buildWeeklyBucket(key, label, pnls)
  return {
    ...base,
    returnPct: compoundReturnPct(returns),
    returnTrades: returns.length,
  }
}

function buildWeeklyBucket(key: string, label: string, pnls: number[]): WeeklyBucket {
  const base = buildBucket(key, label, pnls)
  const grossProfit = pnls.filter((p) => p > 0).reduce((sum, p) => sum + p, 0)
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((sum, p) => sum + p, 0))
  return { ...base, grossProfit, grossLoss }
}

function computePnlDistribution(closed: Array<AnalyticsTrade & { net_pnl: number }>): PnlDistributionBucket[] {
  const definitions = [
    { label: "< -$250", min: Number.NEGATIVE_INFINITY, max: -250 },
    { label: "-$250 to -$100", min: -250, max: -100 },
    { label: "-$100 to -$50", min: -100, max: -50 },
    { label: "-$50 to $0", min: -50, max: 0 },
    { label: "$0 to $50", min: 0, max: 50 },
    { label: "$50 to $100", min: 50, max: 100 },
    { label: "$100 to $250", min: 100, max: 250 },
    { label: "> $250", min: 250, max: Number.POSITIVE_INFINITY },
  ]

  return definitions.map((def, index) => {
    const matching = closed.filter((trade) => {
      if (def.min === Number.NEGATIVE_INFINITY) return trade.net_pnl < def.max
      if (def.max === Number.POSITIVE_INFINITY) return trade.net_pnl >= def.min
      return trade.net_pnl >= def.min && trade.net_pnl < def.max
    })
    return {
      bucket: String(index),
      label: def.label,
      count: matching.length,
      netPnl: matching.reduce((sum, trade) => sum + trade.net_pnl, 0),
    }
  })
}

export function computePeriodComparison(
  current: AnalyticsResult["overview"],
  previous: AnalyticsResult["overview"] | null,
  label: string,
): PeriodComparison | null {
  if (!previous || previous.closedTrades === 0) return null
  return {
    netPnlDelta: current.netPnl - previous.netPnl,
    winRateDelta: current.winRate - previous.winRate,
    closedTradesDelta: current.closedTrades - previous.closedTrades,
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

function computeStreaks(closed: Array<AnalyticsTrade & { net_pnl: number }>): {
  currentStreak: StreakInfo
  bestWinStreak: number
  worstLossStreak: number
} {
  const sorted = sortByExitDate(closed)

  let bestWinStreak = 0
  let worstLossStreak = 0
  let runWin = 0
  let runLoss = 0

  for (const trade of sorted) {
    if (trade.net_pnl > 0) {
      runWin += 1
      runLoss = 0
      bestWinStreak = Math.max(bestWinStreak, runWin)
    } else if (trade.net_pnl < 0) {
      runLoss += 1
      runWin = 0
      worstLossStreak = Math.max(worstLossStreak, runLoss)
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

  return { currentStreak, bestWinStreak, worstLossStreak }
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

function computeEquityCurve(
  closed: Array<AnalyticsTrade & { net_pnl: number }>,
): EquityPoint[] {
  const sorted = [...closed].sort((a, b) => {
    const da = toDate(a.exit_date) ?? toDate(a.entry_date)!
    const db = toDate(b.exit_date) ?? toDate(b.entry_date)!
    return da.getTime() - db.getTime()
  })

  let equity = 0
  let peak = 0
  const points: EquityPoint[] = []

  for (const trade of sorted) {
    equity += trade.net_pnl
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
  options: { timezone?: string; minBucketTrades?: number } = {},
): AnalyticsResult {
  const timezone = options.timezone || "UTC"
  const minTrades = options.minBucketTrades ?? MIN_BUCKET_TRADES

  const closed = trades.filter(isClosed)
  const openTrades = trades.length - closed.length

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

  const equityCurve = computeEquityCurve(closed)
  const maxDrawdown = equityCurve.reduce((max, p) => Math.max(max, p.drawdown), 0)
  const maxDrawdownPct = equityCurve.reduce((max, p) => Math.max(max, p.drawdownPct), 0)

  const hourMap = new Map<number, number[]>()
  const weekdayMap = new Map<string, number[]>()
  const monthMap = new Map<string, number[]>()
  const monthReturnMap = new Map<string, number[]>()
  const sessionMap = new Map<string, number[]>()
  const dayMap = new Map<string, number[]>()
  const weekMap = new Map<string, number[]>()
  const strategyMap = new Map<string, number[]>()
  const signalMap = new Map<string, number[]>()
  const instrumentMap = new Map<string, number[]>()

  let longTrades = 0
  let shortTrades = 0
  let longPnl = 0
  let shortPnl = 0

  for (const trade of closed) {
    const closeAnchor = getTradeCloseAnchor(trade)
    if (!closeAnchor) continue

    const entry = toDate(trade.entry_date)
    const closeParts = getZonedParts(closeAnchor, timezone)

    const push = (map: Map<string | number, number[]>, key: string | number, pnl: number) => {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(pnl)
    }

    if (entry) {
      const { hour, minute, weekday } = getZonedParts(entry, timezone)
      const session = classifySession(hour, minute)
      const wd = normalizeWeekday(weekday)
      push(hourMap, hour, trade.net_pnl)
      push(weekdayMap, wd, trade.net_pnl)
      push(sessionMap, session, trade.net_pnl)
    }

    push(dayMap, closeParts.day, trade.net_pnl)
    push(weekMap, mondayKeyFromDay(closeParts.day, timezone), trade.net_pnl)
    push(monthMap, closeParts.month, trade.net_pnl)
    if (typeof trade.return_pct === "number" && Number.isFinite(trade.return_pct)) {
      push(monthReturnMap, closeParts.month, trade.return_pct)
    }

    const strategy = trade.strategy?.trim() || "Unknown"
    const signal = trade.signal?.trim() || "—"
    const instrument = trade.instrument?.trim() || "Unknown"
    push(strategyMap, strategy, trade.net_pnl)
    push(signalMap, signal, trade.net_pnl)
    push(instrumentMap, instrument, trade.net_pnl)

    if (trade.trade_type === "Buy") {
      longTrades += 1
      longPnl += trade.net_pnl
    } else {
      shortTrades += 1
      shortPnl += trade.net_pnl
    }
  }

  const byHour = Array.from({ length: 24 }, (_, h) =>
    buildBucket(String(h), `${String(h).padStart(2, "0")}:00`, hourMap.get(h) ?? []),
  )

  const byWeekday = WEEKDAY_ORDER.map((wd) => buildBucket(wd, wd, weekdayMap.get(wd) ?? []))

  const byMonth = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, pnls]) =>
      buildMonthlyBucket(month, formatMonthLabel(month), pnls, monthReturnMap.get(month) ?? []),
    )

  const byWeek = [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekKey, pnls]) => buildWeeklyBucket(weekKey, formatWeekLabel(weekKey), pnls))

  const bySession = SESSION_ORDER.map((s) =>
    buildBucket(s, SESSION_DETAIL_LABELS[s], sessionMap.get(s) ?? []),
  )

  const byStrategy = [...strategyMap.entries()]
    .map(([k, pnls]) => buildBucket(k, k, pnls))
    .sort((a, b) => b.netPnl - a.netPnl)

  const bySignal = [...signalMap.entries()]
    .map(([k, pnls]) => buildBucket(k, k, pnls))
    .sort((a, b) => b.netPnl - a.netPnl)
    .slice(0, 15)

  const byInstrument = [...instrumentMap.entries()]
    .map(([k, pnls]) => buildBucket(k, k, pnls))
    .sort((a, b) => b.netPnl - a.netPnl)

  const bestDayEntry = [...dayMap.entries()].sort(([, a], [, b]) => {
    const pa = a.reduce((s, p) => s + p, 0)
    const pb = b.reduce((s, p) => s + p, 0)
    return pb - pa
  })[0]
  const worstDayEntry = [...dayMap.entries()].sort(([, a], [, b]) => {
    const pa = a.reduce((s, p) => s + p, 0)
    const pb = b.reduce((s, p) => s + p, 0)
    return pa - pb
  })[0]

  const bestMonthEntry = [...monthMap.entries()].sort(([, a], [, b]) => {
    const pa = a.reduce((s, p) => s + p, 0)
    const pb = b.reduce((s, p) => s + p, 0)
    return pb - pa
  })[0]
  const worstMonthEntry = [...monthMap.entries()].sort(([, a], [, b]) => {
    const pa = a.reduce((s, p) => s + p, 0)
    const pb = b.reduce((s, p) => s + p, 0)
    return pa - pb
  })[0]

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
  const bestDayPnl = bestDayEntry ? bestDayEntry[1].reduce((s, p) => s + p, 0) : 0
  const worstDayPnl = worstDayEntry ? worstDayEntry[1].reduce((s, p) => s + p, 0) : 0

  const tradesPerDayCounts = [...dayMap.values()].map((pnls) => pnls.length)
  const datedTrades = tradesPerDayCounts.reduce((sum, count) => sum + count, 0)
  const tradingDays = tradesPerDayCounts.length
  const avgTradesPerDay = tradingDays ? datedTrades / tradingDays : 0
  const medianTradesPerDay = median(tradesPerDayCounts)
  const minTradesPerDay = tradingDays ? Math.min(...tradesPerDayCounts) : 0
  const maxTradesPerDay = tradingDays ? Math.max(...tradesPerDayCounts) : 0
  const calendarWeeks = calendarWeeksSpan([...dayMap.keys()])
  const avgTradesPerWeek = calendarWeeks > 0 ? datedTrades / calendarWeeks : 0
  const accountWinRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const zoneThresholds = computeZoneThresholds({ winRate: accountWinRate })

  return {
    overview: {
      totalTrades: trades.length,
      closedTrades: closed.length,
      openTrades,
      wins: wins.length,
      losses: losses.length,
      breakEven: breakEven.length,
      winRate: accountWinRate,
      netPnl,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
      expectancy: closed.length ? netPnl / closed.length : 0,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      totalCommission,
      avgReturnPct,
      maxDrawdown,
      maxDrawdownPct,
      longTrades,
      shortTrades,
      longPnl,
      shortPnl,
      bestDay: bestDayEntry
        ? { date: bestDayEntry[0], pnl: bestDayEntry[1].reduce((s, p) => s + p, 0) }
        : null,
      worstDay: worstDayEntry
        ? { date: worstDayEntry[0], pnl: worstDayEntry[1].reduce((s, p) => s + p, 0) }
        : null,
      bestMonth: bestMonthEntry
        ? {
            month: formatMonthLabel(bestMonthEntry[0]),
            pnl: bestMonthEntry[1].reduce((s, p) => s + p, 0),
          }
        : null,
      worstMonth: worstMonthEntry
        ? {
            month: formatMonthLabel(worstMonthEntry[0]),
            pnl: worstMonthEntry[1].reduce((s, p) => s + p, 0),
          }
        : null,
      avgHoldTimeMs: averageMs(holdTimes),
      avgHoldTimeWinMs: averageMs(winHoldTimes),
      avgHoldTimeLossMs: averageMs(lossHoldTimes),
      holdTimeTrades: holdTimes.length,
      tradingDays,
      avgTradesPerDay,
      medianTradesPerDay,
      minTradesPerDay,
      maxTradesPerDay,
      calendarWeeks,
      avgTradesPerWeek,
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
    comparison: null,
    topWinners,
    topLosers,
    extremes,
  }
}
