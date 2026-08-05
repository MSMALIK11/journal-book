import {
  computeAnalytics,
  MIN_BUCKET_TRADES,
  type AnalyticsTrade,
  type BucketStats,
} from "@/lib/trading/analytics"
import type { ResearchTrade } from "@/lib/trading/research"
import {
  classifySession,
  getZonedParts,
  normalizeWeekday,
  SESSION_LABELS,
  SESSION_ORDER,
  SESSION_SHORT_LABELS,
  getSessionDef,
  isOverlapWindow,
  type TradingSession,
} from "@/lib/trading/sessions"
import {
  breakevenWinRate,
  classifyZone,
  computeZoneThresholds,
  DEFAULT_RR_RATIO,
  DEFAULT_ZONE_THRESHOLDS,
  ZONE_GREEN_MIN,
  ZONE_YELLOW_MIN,
  type TradeZone,
  type ZoneThresholds,
} from "@/lib/trading/zone-thresholds"

export {
  breakevenWinRate,
  classifyZone,
  computeZoneThresholds,
  DEFAULT_RR_RATIO,
  DEFAULT_ZONE_THRESHOLDS,
  ZONE_GREEN_MIN,
  ZONE_YELLOW_MIN,
  type TradeZone,
  type ZoneThresholds,
}

export type ZoneBucketSnapshot = {
  label: string
  winRate: number
  trades: number
  netPnl: number
  zone: TradeZone
}

export type SessionTimelineItem = {
  key: TradingSession
  shortLabel: string
  label: string
  timeRange: string
  tier?: 5
  winRate: number
  trades: number
  zone: TradeZone
  isActive: boolean
}

export const SESSION_TIMELINE_ORDER: TradingSession[] = SESSION_ORDER

export type MomentZoneSnapshot = {
  rrRatio: number
  breakevenWinRate: number
  thresholds: ZoneThresholds
  overallZone: TradeZone
  instrumentLabel: string
  activeSessionKey: TradingSession
  isOverlapWindow: boolean
  sessionTimeline: SessionTimelineItem[]
  hour: ZoneBucketSnapshot
  weekday: ZoneBucketSnapshot
  session: ZoneBucketSnapshot
  message: string
}

export type ZoneAlertSeverity = "danger" | "warning" | "success" | "info"

/** @deprecated use ZONE_YELLOW_MIN */
export const ZONE_RED_MAX = ZONE_YELLOW_MIN
/** @deprecated thresholds are computed per account from analytics */
export const ZONE_YELLOW_MAX = ZONE_GREEN_MIN

export function formatZoneThresholdLegend(thresholds: ZoneThresholds): string {
  const yellowMax = thresholds.greenMin - 1
  return `Red <${thresholds.yellowMin.toFixed(0)}% or −P&L · Yellow ${thresholds.yellowMin.toFixed(0)}–${yellowMax}% · Green ${thresholds.greenMin}%+`
}

export function formatZonePnl(netPnl: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(netPnl)
}

/** Plain-language reason a bucket is weak, average, or strong. */
export function explainZoneReason(
  snapshot: ZoneBucketSnapshot,
  zone: TradeZone,
  thresholds: ZoneThresholds,
): string {
  if (zone === "neutral") {
    return `Only ${snapshot.trades} trades — need ${MIN_BUCKET_TRADES}+ to analyze this bucket.`
  }

  const wr = snapshot.winRate.toFixed(0)
  const pnl = formatZonePnl(snapshot.netPnl)
  const be = thresholds.yellowMin.toFixed(0)
  const strong = thresholds.greenMin.toFixed(0)
  const avg = thresholds.accountWinRate.toFixed(0)

  if (zone === "red") {
    if (snapshot.netPnl < 0 && snapshot.winRate < thresholds.yellowMin) {
      return `${wr}% win rate and ${pnl} lost — below your ${be}% break-even on ${snapshot.trades} trades.`
    }
    if (snapshot.netPnl < 0) {
      return `${pnl} net loss across ${snapshot.trades} trades in this bucket.`
    }
    return `${wr}% win rate — below ${be}% break-even on ${snapshot.trades} trades.`
  }

  if (zone === "yellow") {
    if (snapshot.netPnl > 0) {
      return `${wr}% wins with ${pnl} profit — above break-even but under ${strong}% strong zone.`
    }
    return `${wr}% win rate — above ${be}% break-even but under ${strong}% strong zone.`
  }

  if (snapshot.netPnl > 0) {
    return `${wr}% wins with ${pnl} profit — strong zone (${strong}%+, account avg ${avg}%).`
  }
  return `${wr}% win rate on ${snapshot.trades} trades — strong zone (${strong}%+).`
}

export function zoneOverallHeadline(
  overall: TradeZone,
  hour: ZoneBucketSnapshot,
  weekday: ZoneBucketSnapshot,
  session: ZoneBucketSnapshot,
  thresholds: ZoneThresholds,
): { title: string; message: string } {
  if (overall === "neutral") {
    return {
      title: "Still building your stats",
      message: `Need ${MIN_BUCKET_TRADES}+ trades per hour, day, and session before alerts are reliable.`,
    }
  }

  const buckets = [
    { snap: hour, label: hour.label },
    { snap: weekday, label: weekday.label },
    { snap: session, label: shortSessionLabel(session.label) },
  ].filter((b) => b.snap.zone !== "neutral")

  const primary =
    buckets.find((b) => b.snap.zone === overall) ??
    buckets.find((b) => b.snap.zone === "red") ??
    buckets[0]

  if (overall === "red") {
    return {
      title: "This time slot has hurt your account",
      message: explainZoneReason(primary.snap, primary.snap.zone, thresholds),
    }
  }

  if (overall === "yellow") {
    return {
      title: "Win rate is okay — not your best edge",
      message: explainZoneReason(primary.snap, primary.snap.zone, thresholds),
    }
  }

  return {
    title: "Your stats look good for right now",
    message: explainZoneReason(primary.snap, primary.snap.zone, thresholds),
  }
}

export function zoneLabel(zone: TradeZone): string {
  switch (zone) {
    case "red":
      return "Weak"
    case "yellow":
      return "Average"
    case "green":
      return "Strong"
    default:
      return "Low data"
  }
}

export function zoneTitle(zone: TradeZone): string {
  switch (zone) {
    case "red":
      return "This time slot has hurt your account"
    case "yellow":
      return "Win rate is okay — not your best edge"
    case "green":
      return "Your stats look good for right now"
    default:
      return "Still building your stats"
  }
}

export function zoneSeverity(zone: TradeZone): ZoneAlertSeverity | null {
  switch (zone) {
    case "red":
      return "danger"
    case "yellow":
      return "warning"
    case "green":
      return "success"
    default:
      return null
  }
}

export function zoneHeaderClass(zone: TradeZone): string {
  switch (zone) {
    case "red":
      return "bg-rose-500/15 border-rose-500/40 text-rose-700 dark:text-rose-300"
    case "yellow":
      return "bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-300"
    case "green":
      return "bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
    default:
      return "bg-muted/50 border-border text-muted-foreground"
  }
}

export function zoneChipClass(zone: TradeZone): string {
  switch (zone) {
    case "red":
      return "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30"
    case "yellow":
      return "bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/35"
    case "green":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function worstZone(zones: TradeZone[]): TradeZone {
  if (zones.includes("red")) return "red"
  if (zones.includes("yellow")) return "yellow"
  if (zones.includes("green")) return "green"
  return "neutral"
}

function bucketSnapshot(
  bucket: BucketStats | undefined,
  fallbackLabel: string,
  thresholds: ZoneThresholds,
): ZoneBucketSnapshot {
  if (!bucket || bucket.trades < MIN_BUCKET_TRADES) {
    return {
      label: fallbackLabel,
      winRate: 0,
      trades: bucket?.trades ?? 0,
      netPnl: bucket?.netPnl ?? 0,
      zone: "neutral",
    }
  }
  return {
    label: bucket.label,
    winRate: bucket.winRate,
    trades: bucket.trades,
    netPnl: bucket.netPnl,
    zone: classifyZone(bucket, thresholds),
  }
}

function formatHourLabel(hour: number) {
  const period = hour >= 12 ? "PM" : "AM"
  const h = hour % 12 || 12
  return `${h}:00 ${period}`
}

function shortSessionLabel(label: string) {
  const idx = label.indexOf(" (")
  return idx > 0 ? label.slice(0, idx) : label
}

export { shortSessionLabel }

function buildZoneMessage(
  _instrumentLabel: string,
  _overall: TradeZone,
  hour: ZoneBucketSnapshot,
  weekday: ZoneBucketSnapshot,
  session: ZoneBucketSnapshot,
  thresholds: ZoneThresholds,
): string {
  const lines = [
    hour.zone !== "neutral"
      ? `${hour.label}: ${explainZoneReason(hour, hour.zone, thresholds)}`
      : null,
    weekday.zone !== "neutral"
      ? `${weekday.label}: ${explainZoneReason(weekday, weekday.zone, thresholds)}`
      : null,
    session.zone !== "neutral"
      ? `${shortSessionLabel(session.label)}: ${explainZoneReason(session, session.zone, thresholds)}`
      : null,
  ].filter(Boolean)

  return lines.slice(0, 2).join(" ")
}

export function getCurrentMomentZones(
  trades: ResearchTrade[],
  options: {
    timezone?: string
    now?: Date
    instrumentLabel?: string
    rrRatio?: number
  } = {},
): MomentZoneSnapshot {
  const timezone = options.timezone || "UTC"
  const now = options.now || new Date()
  const instrumentLabel = options.instrumentLabel || "this account"
  const rrRatio = options.rrRatio ?? DEFAULT_RR_RATIO

  const analytics = computeAnalytics(trades as AnalyticsTrade[], { timezone })
  const thresholds = computeZoneThresholds(analytics.overview, rrRatio)
  const { hour, minute, weekday } = getZonedParts(now, timezone)
  const weekdayKey = normalizeWeekday(weekday)
  const sessionKey = classifySession(hour, minute)
  const sessionLabel = SESSION_LABELS[sessionKey]

  const hourSnap = bucketSnapshot(
    analytics.byHour.find((b) => b.key === String(hour)),
    formatHourLabel(hour),
    thresholds,
  )
  const weekdaySnap = bucketSnapshot(
    analytics.byWeekday.find((b) => b.key === weekdayKey),
    weekdayKey,
    thresholds,
  )
  const sessionSnap = bucketSnapshot(
    analytics.bySession.find((b) => b.key === sessionKey),
    sessionLabel,
    thresholds,
  )

  const sessionTimeline: SessionTimelineItem[] = SESSION_TIMELINE_ORDER.map((key) => {
    const bucket = analytics.bySession.find((b) => b.key === key)
    const snap = bucketSnapshot(bucket, SESSION_LABELS[key], thresholds)
    const def = getSessionDef(key)
    return {
      key,
      shortLabel: SESSION_SHORT_LABELS[key],
      label: def.label,
      timeRange: def.timeRange,
      tier: def.tier,
      winRate: snap.winRate,
      trades: snap.trades,
      zone: snap.zone,
      isActive: key === sessionKey,
    }
  })

  const sampled = [hourSnap, weekdaySnap, sessionSnap].filter((s) => s.zone !== "neutral")
  const overallZone = worstZone(sampled.map((s) => s.zone))

  return {
    rrRatio,
    breakevenWinRate: breakevenWinRate(rrRatio),
    thresholds,
    overallZone,
    instrumentLabel,
    activeSessionKey: sessionKey,
    isOverlapWindow: isOverlapWindow(hour, minute),
    sessionTimeline,
    hour: hourSnap,
    weekday: weekdaySnap,
    session: sessionSnap,
    message: buildZoneMessage(
      instrumentLabel,
      overallZone,
      hourSnap,
      weekdaySnap,
      sessionSnap,
      thresholds,
    ),
  }
}

export function zoneAlertCopy(
  zone: TradeZone,
  dimension: "hour" | "weekday" | "session",
  snapshot: ZoneBucketSnapshot,
  thresholds: ZoneThresholds,
): { title: string; message: string; severity: ZoneAlertSeverity } | null {
  const severity = zoneSeverity(zone)
  if (!severity || zone === "neutral") return null

  const label =
    dimension === "session" ? shortSessionLabel(snapshot.label) : snapshot.label

  return {
    severity,
    title:
      zone === "red"
        ? `${label} — usually loses`
        : zone === "yellow"
          ? `${label} — average results`
          : `${label} — strong results`,
    message: explainZoneReason(snapshot, zone, thresholds),
  }
}
