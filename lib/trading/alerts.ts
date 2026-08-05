import {
  computeAnalytics,
  MIN_BUCKET_TRADES,
  type AnalyticsTrade,
  type AvoidInsight,
} from "@/lib/trading/analytics"
import { computeResearchInsights, type ResearchTrade } from "@/lib/trading/research"
import {
  classifySession,
  getSessionDef,
  getZonedParts,
  isOverlapWindow,
  isPremiumSession,
  normalizeWeekday,
  SESSION_LABELS,
  type TradingSession,
} from "@/lib/trading/sessions"
import {
  classifyZone,
  explainZoneReason,
  getCurrentMomentZones,
  shortSessionLabel,
  zoneAlertCopy,
  zoneOverallHeadline,
  type ZoneThresholds,
} from "@/lib/trading/trade-zones"

export type AlertSeverity = "danger" | "warning" | "success" | "info"
export type AlertCategory =
  | "hour"
  | "weekday"
  | "session"
  | "season"
  | "instrument_session"
  | "streak"
  | "today"
  | "digest"
  | "behavior_tilt"
  | "behavior_overtrade"
  | "behavior_recovery"
  | "research_edge"
  | "research_leak"
  | "analytics_avoid"
  | "analytics_best"
  | "session_deadzone"
  | "session_overlap"
  | "session_key"

export type AlertContext = {
  hour?: number
  weekday?: string
  session?: string
  month?: string
  instrument?: string
  zone?: string
}

export type TradingAlertPayload = {
  key: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  message: string
  metric?: string
  context: AlertContext
  priority?: number
  action?: string
}

export type AlertPreferences = {
  dailyDigest: boolean
  weakHours: boolean
  weakDays: boolean
  weakSessions: boolean
  edgeAlerts: boolean
  streakWarnings: boolean
  seasonAlerts: boolean
  instrumentSession: boolean
  todaySummary: boolean
  behaviorAlerts: boolean
  researchAlerts: boolean
  deadZoneAlerts: boolean
  overlapAlerts: boolean
  keySessionAlerts: boolean
}

export const DEFAULT_ALERT_PREFERENCES: AlertPreferences = {
  dailyDigest: true,
  weakHours: true,
  weakDays: true,
  weakSessions: true,
  edgeAlerts: true,
  streakWarnings: true,
  seasonAlerts: true,
  instrumentSession: true,
  todaySummary: true,
  behaviorAlerts: true,
  researchAlerts: true,
  deadZoneAlerts: true,
  overlapAlerts: true,
  keySessionAlerts: true,
}

export type EvaluateAlertsOptions = {
  timezone?: string
  now?: Date
  instrumentLabel?: string
  preferences?: Partial<AlertPreferences>
}

export const MAX_ACTIVE_ALERTS = 3

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatMetric(item: { trades: number; winRate: number; netPnl: number }) {
  return `${item.winRate.toFixed(0)}% · ${item.trades} trades · ${currency.format(item.netPnl)}`
}

function dayKey(date: Date, timezone: string) {
  return getZonedParts(date, timezone).day
}

const SEVERITY_WEIGHT: Record<AlertSeverity, number> = {
  danger: 3,
  warning: 2,
  success: 1.5,
  info: 1,
}

function extractNetPnl(alert: TradingAlertPayload): number {
  if (!alert.metric) return 0
  const match = alert.metric.match(/-?\$[\d,]+/)
  if (!match) return 0
  return Math.abs(Number(match[0].replace(/[$,]/g, ""))) || 0
}

export function computeAlertPriority(alert: TradingAlertPayload): number {
  const pnl = extractNetPnl(alert)
  const severityWeight = SEVERITY_WEIGHT[alert.severity] ?? 1
  const recencyWeight = alert.category.startsWith("behavior") ? 1.5 : 1
  return pnl * severityWeight * recencyWeight
}

function withPriority(alert: TradingAlertPayload): TradingAlertPayload {
  return {
    ...alert,
    priority: computeAlertPriority(alert),
  }
}

function filterByPreferences(
  alerts: TradingAlertPayload[],
  preferences: AlertPreferences,
): TradingAlertPayload[] {
  return alerts.filter((alert) => {
    switch (alert.category) {
      case "hour":
        if (alert.severity === "success") return preferences.edgeAlerts
        return preferences.weakHours
      case "weekday":
        if (alert.severity === "success") return preferences.edgeAlerts
        return preferences.weakDays
      case "session":
        if (alert.severity === "success") return preferences.edgeAlerts
        return preferences.weakSessions
      case "season":
        return preferences.seasonAlerts
      case "instrument_session":
        return preferences.instrumentSession
      case "streak":
        return preferences.streakWarnings
      case "today":
        return preferences.todaySummary
      case "digest":
        return preferences.dailyDigest
      case "behavior_tilt":
      case "behavior_overtrade":
      case "behavior_recovery":
        return preferences.behaviorAlerts
      case "research_edge":
      case "research_leak":
        return preferences.researchAlerts
      case "session_deadzone":
        return preferences.deadZoneAlerts
      case "session_overlap":
        return preferences.overlapAlerts
      case "session_key":
        return preferences.keySessionAlerts
      case "analytics_avoid":
        return preferences.weakHours || preferences.weakSessions
      case "analytics_best":
        return preferences.edgeAlerts
      default:
        return true
    }
  })
}

function computeTodayStats(
  trades: Array<AnalyticsTrade & { net_pnl: number }>,
  timezone: string,
  now: Date,
) {
  const today = dayKey(now, timezone)
  const todayTrades = trades.filter((trade) => {
    const entry = trade.entry_date instanceof Date ? trade.entry_date : new Date(trade.entry_date)
    return dayKey(entry, timezone) === today
  })

  const wins = todayTrades.filter((t) => t.net_pnl > 0).length
  const losses = todayTrades.filter((t) => t.net_pnl < 0).length
  const closed = todayTrades.length
  const winRate = closed ? (wins / closed) * 100 : null
  const netPnl = todayTrades.reduce((sum, t) => sum + t.net_pnl, 0)

  return { wins, losses, closed, winRate, netPnl }
}

function pushZoneAlert(
  alerts: TradingAlertPayload[],
  keyPrefix: string,
  category: AlertCategory,
  dimension: "hour" | "weekday" | "session",
  snapshot: ReturnType<typeof getCurrentMomentZones>[typeof dimension],
  instrumentLabel: string,
  context: AlertContext,
  dateKey: string,
  thresholds: ZoneThresholds,
) {
  if (snapshot.zone === "neutral") return

  const copy = zoneAlertCopy(snapshot.zone, dimension, snapshot, thresholds)
  if (!copy) return

  alerts.push(
    withPriority({
      key: `${keyPrefix}:${snapshot.zone}:${dateKey}`,
      category,
      severity: copy.severity,
      title: copy.title,
      message: copy.message,
      metric: formatMetric(snapshot),
      action: copy.severity === "success" ? "Trade your usual setup" : "Consider waiting",
      context: { ...context, zone: snapshot.zone },
    }),
  )
}

function evaluateBehaviorAlerts(
  alerts: TradingAlertPayload[],
  research: ReturnType<typeof computeResearchInsights>,
  closed: Array<ResearchTrade & { net_pnl: number }>,
  todayStats: ReturnType<typeof computeTodayStats>,
  dateKey: string,
  baseContext: AlertContext,
) {
  const { behavior } = research

  const sortedClosed = [...closed].sort((a, b) => {
    const da = a.exit_date ? new Date(a.exit_date).getTime() : new Date(a.entry_date).getTime()
    const db = b.exit_date ? new Date(b.exit_date).getTime() : new Date(b.entry_date).getTime()
    return db - da
  })
  const lastTrade = sortedClosed[0]

  if (
    lastTrade &&
    lastTrade.net_pnl < 0 &&
    behavior.afterLossNextWinRate !== null &&
    behavior.afterLossNextWinRate < behavior.baselineWinRate - 10
  ) {
    alerts.push(
      withPriority({
        key: `behavior_tilt:${dateKey}`,
        category: "behavior_tilt",
        severity: "warning",
        title: "Pause before your next trade",
        message: "Your last trade was a loss — after-loss win rate drops below your baseline.",
        metric: `${behavior.afterLossNextWinRate.toFixed(0)}% after loss vs ${behavior.baselineWinRate.toFixed(0)}% baseline`,
        action: "Take a short break before re-entering",
        context: baseContext,
      }),
    )
  }

  if (
    todayStats.closed >= 3 &&
    behavior.highDensityDayAvgPnl !== null &&
    behavior.lowDensityDayAvgPnl !== null &&
    behavior.highDensityDayAvgPnl < behavior.lowDensityDayAvgPnl - 50
  ) {
    alerts.push(
      withPriority({
        key: `behavior_overtrade:${dateKey}`,
        category: "behavior_overtrade",
        severity: "warning",
        title: `${todayStats.closed} trades today — overtrading risk`,
        message: "Days with 3+ trades underperform your lighter trading days.",
        metric: `${currency.format(behavior.highDensityDayAvgPnl)} vs ${currency.format(behavior.lowDensityDayAvgPnl)} avg/day`,
        action: "Stop for the day or cut size",
        context: baseContext,
      }),
    )
  }

  if (
    todayStats.netPnl < 0 &&
    behavior.avgTradesToRecoverAfterLossDay !== null &&
    behavior.avgTradesToRecoverAfterLossDay >= 3 &&
    behavior.lossDayRecoverySamples >= MIN_BUCKET_TRADES
  ) {
    alerts.push(
      withPriority({
        key: `behavior_recovery:${dateKey}`,
        category: "behavior_recovery",
        severity: "info",
        title: "Recovery mode — size down",
        message: `Down ${currency.format(Math.abs(todayStats.netPnl))} today. You usually need ${behavior.avgTradesToRecoverAfterLossDay.toFixed(1)} trades to recover after a red day.`,
        metric: `${behavior.lossDayRecoverySamples} loss-day samples`,
        action: "Reduce size or wait for a stronger window",
        context: baseContext,
      }),
    )
  }
}

function findAvoidMatch(
  avoidList: AvoidInsight[],
  key: string,
  labelMatch?: string,
): AvoidInsight | undefined {
  return (
    avoidList.find((a) => a.key === key) ??
    (labelMatch ? avoidList.find((a) => a.label.toLowerCase().includes(labelMatch.toLowerCase())) : undefined)
  )
}

function evaluateResearchAndAnalyticsAlerts(
  alerts: TradingAlertPayload[],
  analytics: ReturnType<typeof computeAnalytics>,
  research: ReturnType<typeof computeResearchInsights>,
  session: TradingSession,
  sessionLabel: string,
  hour: number,
  primaryInstrument: string | undefined,
  dateKey: string,
  baseContext: AlertContext,
  thresholds: ZoneThresholds,
) {
  if (primaryInstrument) {
    const currentSessionRow = research.patterns.sessionByInstrument.find(
      (row) =>
        row.instrument.toUpperCase() === primaryInstrument.toUpperCase() && row.session === session,
    )

    if (currentSessionRow && currentSessionRow.trades >= MIN_BUCKET_TRADES) {
      const rowZone = classifyZone(currentSessionRow, thresholds)
      if (rowZone === "red" || (rowZone === "yellow" && currentSessionRow.netPnl < 0)) {
        alerts.push(
          withPriority({
            key: `research_leak:${primaryInstrument}:${session}:${dateKey}`,
            category: "research_leak",
            severity: "danger",
            title: `Skip — ${primaryInstrument} weak in ${shortSessionLabel(sessionLabel)}`,
            message: "This instrument-session combo consistently loses in your data.",
            metric: formatMetric(currentSessionRow),
            action: "Skip or reduce size on this setup",
            context: { ...baseContext, instrument: primaryInstrument, zone: rowZone },
          }),
        )
      } else if (rowZone === "green") {
        alerts.push(
          withPriority({
            key: `research_edge:${primaryInstrument}:${session}:${dateKey}`,
            category: "research_edge",
            severity: "success",
            title: `Edge — ${primaryInstrument} strong in ${shortSessionLabel(sessionLabel)}`,
            message: "Repeat this setup — strong session-instrument combination.",
            metric: formatMetric(currentSessionRow),
            action: "Trade your usual setup here",
            context: { ...baseContext, instrument: primaryInstrument, zone: rowZone },
          }),
        )
      }
    }
  }

  const hourStr = String(hour)
  const avoidHour = findAvoidMatch(analytics.avoid.hours, hourStr)
  if (avoidHour) {
    alerts.push(
      withPriority({
        key: `analytics_avoid:hour:${hourStr}:${dateKey}`,
        category: "analytics_avoid",
        severity: "warning",
        title: `Wait — ${avoidHour.label} loses you money`,
        message: avoidHour.reason,
        metric: formatMetric(avoidHour),
        action: "Consider skipping this hour",
        context: { ...baseContext, hour, zone: "red" },
      }),
    )
  }

  const avoidSession = findAvoidMatch(analytics.avoid.sessions, session, sessionLabel)
  if (avoidSession) {
    alerts.push(
      withPriority({
        key: `analytics_avoid:session:${session}:${dateKey}`,
        category: "analytics_avoid",
        severity: "warning",
        title: `Skip — ${shortSessionLabel(sessionLabel)} is a weak window`,
        message: avoidSession.reason,
        metric: formatMetric(avoidSession),
        action: "Consider sitting out this session",
        context: { ...baseContext, session, zone: "red" },
      }),
    )
  }

  const bestHour = analytics.avoid.bestHours.find((b) => b.key === hourStr)
  if (bestHour) {
    alerts.push(
      withPriority({
        key: `analytics_best:hour:${hourStr}:${dateKey}`,
        category: "analytics_best",
        severity: "success",
        title: `Good hour — ${bestHour.label} is strong`,
        message: bestHour.reason,
        metric: formatMetric(bestHour),
        action: "Trade your usual setup",
        context: { ...baseContext, hour, zone: "green" },
      }),
    )
  }

  const bestSession = analytics.avoid.bestSessions.find((b) => b.key === session)
  if (bestSession) {
    alerts.push(
      withPriority({
        key: `analytics_best:session:${session}:${dateKey}`,
        category: "analytics_best",
        severity: "success",
        title: `Good window — ${shortSessionLabel(sessionLabel)} is strong`,
        message: bestSession.reason,
        metric: formatMetric(bestSession),
        action: "Trade your usual setup",
        context: { ...baseContext, session, zone: "green" },
      }),
    )
  }
}

function evaluateSessionSpecialAlerts(
  alerts: TradingAlertPayload[],
  analytics: ReturnType<typeof computeAnalytics>,
  session: TradingSession,
  sessionLabel: string,
  hour: number,
  minute: number,
  dateKey: string,
  baseContext: AlertContext,
  thresholds: ZoneThresholds,
) {
  if (session === "DeadZone") {
    const bucket = analytics.bySession.find((b) => b.key === "DeadZone")
    if (bucket && bucket.trades >= MIN_BUCKET_TRADES) {
      const zone = classifyZone(bucket, thresholds)
      alerts.push(
        withPriority({
          key: `session_deadzone:${dateKey}`,
          category: "session_deadzone",
          severity: zone === "red" ? "warning" : "info",
          title: "Dead Zone — historically low edge",
          message:
            zone === "neutral"
              ? "Limited data in this window — proceed with caution."
              : explainZoneReason(
                  {
                    label: sessionLabel,
                    winRate: bucket.winRate,
                    trades: bucket.trades,
                    netPnl: bucket.netPnl,
                    zone,
                  },
                  zone,
                  thresholds,
                ),
          metric: formatMetric(bucket),
          action: "Consider skipping until a key session opens",
          context: { ...baseContext, session, zone },
        }),
      )
    } else {
      alerts.push(
        withPriority({
          key: `session_deadzone:${dateKey}`,
          category: "session_deadzone",
          severity: "info",
          title: "Dead Zone — low-activity window",
          message: "Historically low edge — consider skipping until London or NY opens.",
          action: "Wait for a key session",
          context: { ...baseContext, session },
        }),
      )
    }
  }

  if (isOverlapWindow(hour, minute)) {
    const overlapBucket = analytics.bySession.find((b) => b.key === "LondonNyOverlap")
    if (overlapBucket && overlapBucket.trades >= MIN_BUCKET_TRADES) {
      const zone = classifyZone(overlapBucket, thresholds)
      if (zone !== "neutral") {
        const copy = zoneAlertCopy(
          zone,
          "session",
          {
            label: SESSION_LABELS.LondonNyOverlap,
            winRate: overlapBucket.winRate,
            trades: overlapBucket.trades,
            netPnl: overlapBucket.netPnl,
            zone,
          },
          thresholds,
        )
        alerts.push(
          withPriority({
            key: `session_overlap:${dateKey}`,
            category: "session_overlap",
            severity: copy?.severity ?? (zone === "green" ? "success" : "warning"),
            title:
              zone === "green"
                ? "Overlap window — strong for you"
                : zone === "red"
                  ? "Overlap window — weak for you"
                  : "Overlap window — average for you",
            message: explainZoneReason(
              {
                label: SESSION_LABELS.LondonNyOverlap,
                winRate: overlapBucket.winRate,
                trades: overlapBucket.trades,
                netPnl: overlapBucket.netPnl,
                zone,
              },
              zone,
              thresholds,
            ),
            metric: formatMetric(overlapBucket),
            action: zone === "green" ? "Trade your usual setup" : "Size down or wait",
            context: { ...baseContext, session: "LondonNyOverlap", zone },
          }),
        )
      }
    }
  }

  if (isPremiumSession(session) && session !== "LondonNyOverlap") {
    const bucket = analytics.bySession.find((b) => b.key === session)
    if (bucket && bucket.trades >= MIN_BUCKET_TRADES) {
      const zone = classifyZone(bucket, thresholds)
      if (zone === "green") {
        const def = getSessionDef(session)
        alerts.push(
          withPriority({
            key: `session_key:${session}:${dateKey}`,
            category: "session_key",
            severity: "success",
            title: `Key session — ${def.shortLabel} is strong`,
            message: explainZoneReason(
              {
                label: sessionLabel,
                winRate: bucket.winRate,
                trades: bucket.trades,
                netPnl: bucket.netPnl,
                zone,
              },
              zone,
              thresholds,
            ),
            metric: formatMetric(bucket),
            action: "Focus your best setups here",
            context: { ...baseContext, session, zone },
          }),
        )
      }
    }
  }
}

function mergeDuplicateDimensionAlerts(alerts: TradingAlertPayload[]): TradingAlertPayload[] {
  const dropKeys = new Set<string>()
  const groups: Array<{ categories: AlertCategory[]; getKey: (a: TradingAlertPayload) => string }> = [
    {
      categories: ["hour", "analytics_avoid", "analytics_best"],
      getKey: (a) => `hour:${a.context.hour ?? ""}`,
    },
    {
      categories: [
        "session",
        "analytics_avoid",
        "analytics_best",
        "session_key",
        "session_overlap",
        "research_edge",
        "research_leak",
      ],
      getKey: (a) => `session:${a.context.session ?? ""}`,
    },
  ]

  for (const { categories, getKey } of groups) {
    const byDim = new Map<string, TradingAlertPayload[]>()
    for (const alert of alerts) {
      if (!categories.includes(alert.category)) continue
      const dimKey = getKey(alert)
      if (!dimKey.endsWith(":")) {
        byDim.set(dimKey, [...(byDim.get(dimKey) ?? []), alert])
      }
    }

    for (const [, dimAlerts] of byDim) {
      if (dimAlerts.length <= 1) continue
      const sorted = [...dimAlerts].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      for (const duplicate of sorted.slice(1)) {
        dropKeys.add(duplicate.key)
      }
    }
  }

  return alerts.filter((a) => !dropKeys.has(a.key))
}

export function rankAndCapAlerts(
  alerts: TradingAlertPayload[],
  max = MAX_ACTIVE_ALERTS,
): TradingAlertPayload[] {
  const withScores = alerts.map((a) => ({
    ...a,
    priority: a.priority ?? computeAlertPriority(a),
  }))
  const merged = mergeDuplicateDimensionAlerts(withScores)
  const deduped = dedupeAlerts(merged)
  return deduped
    .filter((a) => a.category !== "digest" && a.category !== "today")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, max)
}

export function getTopActionAlert(
  alerts: TradingAlertPayload[],
): TradingAlertPayload | null {
  const ranked = [...alerts]
    .filter((a) => a.category !== "digest" && a.category !== "today")
    .map((a) => ({ ...a, priority: a.priority ?? computeAlertPriority(a) }))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
  return ranked[0] ?? null
}

export function evaluateTradingAlerts(
  trades: ResearchTrade[],
  options: EvaluateAlertsOptions = {},
): TradingAlertPayload[] {
  const timezone = options.timezone || "UTC"
  const now = options.now || new Date()
  const instrumentLabel = options.instrumentLabel || "this account"
  const preferences = { ...DEFAULT_ALERT_PREFERENCES, ...options.preferences }

  const analytics = computeAnalytics(trades as AnalyticsTrade[], { timezone })
  const research = computeResearchInsights(trades, { timezone })
  const zones = getCurrentMomentZones(trades, { timezone, now, instrumentLabel })
  const thresholds = zones.thresholds

  if (analytics.overview.closedTrades < MIN_BUCKET_TRADES) {
    return []
  }

  const { hour, minute, weekday, month } = getZonedParts(now, timezone)
  const weekdayKey = normalizeWeekday(weekday)
  const session = classifySession(hour, minute)
  const sessionLabel = SESSION_LABELS[session]
  const dateKey = dayKey(now, timezone)
  const baseContext: AlertContext = { hour, weekday: weekdayKey, session, month }

  const alerts: TradingAlertPayload[] = []

  pushZoneAlert(alerts, "zone_hour", "hour", "hour", zones.hour, instrumentLabel, baseContext, dateKey, thresholds)
  pushZoneAlert(
    alerts,
    "zone_weekday",
    "weekday",
    "weekday",
    zones.weekday,
    instrumentLabel,
    baseContext,
    dateKey,
    thresholds,
  )
  pushZoneAlert(
    alerts,
    "zone_session",
    "session",
    "session",
    zones.session,
    instrumentLabel,
    baseContext,
    dateKey,
    thresholds,
  )

  const monthBucket = analytics.byMonth.find((b) => b.key === month)
  if (monthBucket && monthBucket.trades >= MIN_BUCKET_TRADES) {
    const monthZone = classifyZone(monthBucket, thresholds)
    if (monthZone === "red") {
      const monthLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "long",
        year: "numeric",
      }).format(now)

      alerts.push(
        withPriority({
          key: `avoid_season:${month}:${dateKey}`,
          category: "season",
          severity: "warning",
          title: `${monthLabel} — usually a weak month`,
          message: explainZoneReason(
            {
              label: monthLabel,
              winRate: monthBucket.winRate,
              trades: monthBucket.trades,
              netPnl: monthBucket.netPnl,
              zone: monthZone,
            },
            monthZone,
            thresholds,
          ),
          metric: formatMetric(monthBucket),
          action: "Reduce size or be selective",
          context: { ...baseContext, zone: monthZone },
        }),
      )
    } else if (monthZone === "yellow") {
      const monthLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        month: "long",
        year: "numeric",
      }).format(now)

      alerts.push(
        withPriority({
          key: `yellow_season:${month}:${dateKey}`,
          category: "season",
          severity: "warning",
          title: `${monthLabel} — average month`,
          message: explainZoneReason(
            {
              label: monthLabel,
              winRate: monthBucket.winRate,
              trades: monthBucket.trades,
              netPnl: monthBucket.netPnl,
              zone: monthZone,
            },
            monthZone,
            thresholds,
          ),
          metric: formatMetric(monthBucket),
          context: { ...baseContext, zone: monthZone },
        }),
      )
    }
  }

  const primaryInstrument = research.instruments[0] || analytics.instruments[0] || undefined

  if (primaryInstrument) {
    const currentSessionRow = research.patterns.sessionByInstrument.find(
      (row) =>
        row.instrument.toUpperCase() === primaryInstrument.toUpperCase() && row.session === session,
    )

    if (currentSessionRow && currentSessionRow.trades >= MIN_BUCKET_TRADES) {
      const rowZone = classifyZone(currentSessionRow, thresholds)
      if (rowZone !== "neutral") {
        const snap = {
          label: `${primaryInstrument} · ${sessionLabel}`,
          winRate: currentSessionRow.winRate,
          trades: currentSessionRow.trades,
          netPnl: currentSessionRow.netPnl,
          zone: rowZone,
        }
        const copy = zoneAlertCopy(rowZone, "session", snap, thresholds)
        if (copy) {
          alerts.push(
            withPriority({
              key: `zone_instrument_session:${primaryInstrument}:${session}:${dateKey}`,
              category: "instrument_session",
              severity: copy.severity,
              title: `${primaryInstrument} in ${shortSessionLabel(sessionLabel)} — ${rowZone === "red" ? "usually loses" : rowZone === "yellow" ? "average" : "strong"}`,
              message: explainZoneReason(snap, rowZone, thresholds),
              metric: formatMetric(currentSessionRow),
              action: rowZone === "green" ? "Trade your usual setup" : "Skip or reduce size",
              context: {
                ...baseContext,
                instrument: primaryInstrument,
                zone: rowZone,
              },
            }),
          )
        }
      }
    }
  }

  evaluateResearchAndAnalyticsAlerts(
    alerts,
    analytics,
    research,
    session,
    sessionLabel,
    hour,
    primaryInstrument,
    dateKey,
    baseContext,
    thresholds,
  )

  evaluateSessionSpecialAlerts(
    alerts,
    analytics,
    session,
    sessionLabel,
    hour,
    minute,
    dateKey,
    baseContext,
    thresholds,
  )

  const streak = analytics.records.currentStreak
  if (streak.type === "loss" && streak.count >= 3) {
    alerts.push(
      withPriority({
        key: `streak:loss:${dateKey}`,
        category: "streak",
        severity: "warning",
        title: `${streak.count} losses in a row`,
        message: "Consider a short break before the next trade.",
        metric:
          research.behavior.afterLossNextWinRate !== null
            ? `${research.behavior.afterLossNextWinRate.toFixed(0)}% win rate after a loss`
            : undefined,
        action: "Pause before re-entering",
        context: baseContext,
      }),
    )
  }

  const closed = trades.filter(
    (t): t is ResearchTrade & { net_pnl: number } => typeof t.net_pnl === "number",
  )
  const todayStats = computeTodayStats(closed, timezone, now)

  evaluateBehaviorAlerts(alerts, research, closed, todayStats, dateKey, baseContext)

  if (todayStats.closed > 0) {
    const todayZone =
      todayStats.winRate !== null
        ? classifyZone(
            { winRate: todayStats.winRate, trades: todayStats.closed, netPnl: todayStats.netPnl },
            thresholds,
          )
        : "neutral"

    alerts.push(
      withPriority({
        key: `today_summary:${dateKey}`,
        category: "today",
        severity: todayZone === "red" ? "danger" : todayZone === "yellow" ? "warning" : "info",
        title:
          todayZone === "red"
            ? "Today is running below your average"
            : todayZone === "yellow"
              ? "Today is around your average"
              : "Today is running above your average",
        message: explainZoneReason(
          {
            label: "Today",
            winRate: todayStats.winRate ?? 0,
            trades: todayStats.closed,
            netPnl: todayStats.netPnl,
            zone: todayZone,
          },
          todayZone,
          thresholds,
        ),
        metric: `${todayStats.wins}W ${todayStats.losses}L · ${todayStats.winRate?.toFixed(0)}% · ${currency.format(todayStats.netPnl)}`,
        context: { ...baseContext, zone: todayZone },
      }),
    )
  }

  const filtered = filterByPreferences(alerts, preferences)
  return filtered.map((a) => ({ ...a, priority: a.priority ?? computeAlertPriority(a) }))
}

export function buildDailyDigest(
  trades: ResearchTrade[],
  options: EvaluateAlertsOptions = {},
): TradingAlertPayload | null {
  const timezone = options.timezone || "UTC"
  const now = options.now || new Date()
  const instrumentLabel = options.instrumentLabel || "this account"
  const preferences = { ...DEFAULT_ALERT_PREFERENCES, ...options.preferences }

  if (!preferences.dailyDigest) return null

  const analytics = computeAnalytics(trades as AnalyticsTrade[], { timezone })
  if (analytics.overview.closedTrades < MIN_BUCKET_TRADES) return null

  const zones = getCurrentMomentZones(trades, { timezone, now, instrumentLabel })
  const { hour, minute, weekday, month } = getZonedParts(now, timezone)
  const weekdayKey = normalizeWeekday(weekday)
  const session = classifySession(hour, minute)
  const dateKey = dayKey(now, timezone)

  const headline = zoneOverallHeadline(
    zones.overallZone,
    zones.hour,
    zones.weekday,
    zones.session,
    zones.thresholds,
  )

  const parts: string[] = []

  const bestSession = analytics.avoid.bestSessions[0]
  const worstSession = analytics.avoid.sessions[0]

  if (bestSession) {
    parts.push(
      `Best session: ${bestSession.label} (${bestSession.winRate.toFixed(0)}%, ${currency.format(bestSession.netPnl)}).`,
    )
  }
  if (worstSession) {
    parts.push(
      `Avoid: ${worstSession.label} (${worstSession.winRate.toFixed(0)}%, ${currency.format(worstSession.netPnl)}).`,
    )
  }

  const keySessions = ["LondonOpen", "NewYorkOpen", "LondonNyOverlap"] as const
  const keyStatus = keySessions
    .map((key) => {
      const bucket = analytics.bySession.find((b) => b.key === key)
      if (!bucket || bucket.trades < MIN_BUCKET_TRADES) return null
      const zone = classifyZone(bucket, zones.thresholds)
      const label = SESSION_LABELS[key]
      return `${shortSessionLabel(label)}: ${zone === "green" ? "strong" : zone === "red" ? "weak" : "avg"}`
    })
    .filter(Boolean)
  if (keyStatus.length) {
    parts.push(`Key windows — ${keyStatus.join(", ")}.`)
  }

  if (zones.hour.zone !== "neutral") {
    parts.push(explainZoneReason(zones.hour, zones.hour.zone, zones.thresholds))
  }

  const closed = trades.filter(
    (t): t is ResearchTrade & { net_pnl: number } => typeof t.net_pnl === "number",
  )
  const todayStats = computeTodayStats(closed, timezone, now)

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = dayKey(yesterday, timezone)
  const yesterdayTrades = closed.filter((trade) => {
    const entry = trade.entry_date instanceof Date ? trade.entry_date : new Date(trade.entry_date)
    return dayKey(entry, timezone) === yesterdayKey
  })
  const yesterdayPnl = yesterdayTrades.reduce((sum, t) => sum + t.net_pnl, 0)
  if (yesterdayTrades.length > 0) {
    parts.push(`Yesterday: ${currency.format(yesterdayPnl)} on ${yesterdayTrades.length} trades.`)
  }

  const streak = analytics.records.currentStreak
  if (streak.count > 0 && streak.type !== "none") {
    parts.push(`${streak.count} ${streak.type}${streak.count > 1 ? "s" : ""} in a row.`)
  }

  const planParts: string[] = []
  if (bestSession) planParts.push(bestSession.label)
  const overlapBucket = analytics.bySession.find((b) => b.key === "LondonNyOverlap")
  if (overlapBucket && classifyZone(overlapBucket, zones.thresholds) === "green") {
    planParts.push("Overlap")
  }
  const planLine = planParts.length
    ? `Plan: trade ${planParts.join(" + ")} only.`
    : worstSession
      ? `Plan: avoid ${worstSession.label}.`
      : null
  if (planLine) parts.push(planLine)

  if (todayStats.closed > 0) {
    parts.push(
      `Today so far: ${todayStats.wins}W/${todayStats.losses}L, ${currency.format(todayStats.netPnl)}.`,
    )
  }

  return {
    key: `digest:${dateKey}`,
    category: "digest",
    severity: zones.overallZone === "red" ? "danger" : zones.overallZone === "yellow" ? "warning" : "info",
    title: headline.title,
    message: parts.length ? parts.join(" ") : headline.message,
    metric: `${analytics.overview.winRate.toFixed(0)}% account avg · ${analytics.overview.closedTrades} trades`,
    action: planLine ?? "Review your key sessions before trading",
    context: { hour, weekday: weekdayKey, session, month, zone: zones.overallZone },
    priority: 0,
  }
}

export function dedupeAlerts(alerts: TradingAlertPayload[]): TradingAlertPayload[] {
  const byCategoryDay = new Map<string, TradingAlertPayload>()
  for (const alert of alerts) {
    const dayPart = alert.key.split(":").pop() ?? ""
    const categoryKey = `${alert.category}:${dayPart}`
    const existing = byCategoryDay.get(categoryKey)
    if (!existing || (alert.priority ?? 0) > (existing.priority ?? 0)) {
      byCategoryDay.set(categoryKey, alert)
    }
  }
  const byKey = new Map<string, TradingAlertPayload>()
  for (const alert of byCategoryDay.values()) {
    byKey.set(alert.key, alert)
  }
  return [...byKey.values()]
}
