import type { AlertSeverity, TradingAlertPayload } from "@/lib/trading/alerts"
import type { MomentZoneSnapshot } from "@/lib/trading/trade-zones"

export type CoachingVerdictLevel = "stop" | "caution" | "go"

export type CoachingReason = {
  title: string
  metric?: string
  severity: AlertSeverity
  action?: string
}

export type CoachingVerdict = {
  level: CoachingVerdictLevel
  headline: string
  action: string
  reasons: CoachingReason[]
  overallZone: string
}

const STOP_CATEGORIES = new Set([
  "streak",
  "behavior_tilt",
  "behavior_overtrade",
  "drawdown_warning",
  "research_leak",
  "analytics_avoid",
  "session_deadzone",
])

/** Unified coaching verdict for header alerts — separate from the trade alarm modal. */
export function buildCoachingVerdict(
  alerts: TradingAlertPayload[],
  zones: MomentZoneSnapshot | null,
): CoachingVerdict {
  const ranked = [...alerts]
    .filter((a) => a.category !== "digest" && a.category !== "today")
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

  const top = ranked[0]
  const reasons: CoachingReason[] = ranked.slice(0, 2).map((a) => ({
    title: a.title,
    metric: a.metric,
    severity: a.severity,
    action: a.action,
  }))

  const hasDanger = ranked.some((a) => a.severity === "danger")
  const hasStopCategory = ranked.some((a) => STOP_CATEGORIES.has(a.category) && a.severity !== "success")
  const zoneRed = zones?.overallZone === "red"
  const zoneYellow = zones?.overallZone === "yellow"

  const hasStop = hasDanger || hasStopCategory || zoneRed
  const hasCaution =
    !hasStop && (zoneYellow || ranked.some((a) => a.severity === "warning"))

  if (hasStop) {
    return {
      level: "stop",
      headline: top?.title ?? "Stop — weak conditions right now",
      action: top?.action ?? "Wait for a stronger hour or session",
      reasons,
      overallZone: zones?.overallZone ?? "neutral",
    }
  }

  if (hasCaution) {
    return {
      level: "caution",
      headline: top?.title ?? "Proceed with caution",
      action: top?.action ?? "Reduce size or wait for a key session",
      reasons,
      overallZone: zones?.overallZone ?? "neutral",
    }
  }

  if (top?.severity === "success") {
    return {
      level: "go",
      headline: top.title,
      action: top.action ?? "Trade your usual setup",
      reasons,
      overallZone: zones?.overallZone ?? "green",
    }
  }

  return {
    level: "go",
    headline: "All clear — no red flags",
    action: "Trade your usual setup",
    reasons,
    overallZone: zones?.overallZone ?? "neutral",
  }
}
