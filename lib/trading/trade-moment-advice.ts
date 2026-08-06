import type { MomentZoneSnapshot } from "@/lib/trading/trade-zones"
import { explainZoneReason, shortSessionLabel, zoneLabel } from "@/lib/trading/trade-zones"

export type TradeMomentVerdict = "take" | "caution" | "skip"

export type TradeMomentAdvice = {
  verdict: TradeMomentVerdict
  headline: string
  reason: string
  action: string
  overallZone: string
  hour: { label: string; zone: string; summary: string }
  day: { label: string; zone: string; summary: string }
  session: { label: string; zone: string; summary: string }
}

export function buildTradeMomentAdvice(zones: MomentZoneSnapshot): TradeMomentAdvice {
  const { hour, weekday, session, thresholds, overallZone } = zones

  const hourSummary =
    hour.zone !== "neutral"
      ? explainZoneReason(hour, hour.zone, thresholds)
      : `Only ${hour.trades} trades in this hour.`
  const daySummary =
    weekday.zone !== "neutral"
      ? explainZoneReason(weekday, weekday.zone, thresholds)
      : `Only ${weekday.trades} trades on ${weekday.label}.`
  const sessionSummary =
    session.zone !== "neutral"
      ? explainZoneReason(session, session.zone, thresholds)
      : `Only ${session.trades} trades in ${shortSessionLabel(session.label)}.`

  let verdict: TradeMomentVerdict = "caution"
  let headline = "Proceed with caution"
  let action = "Use normal size on A+ setups only"

  if (overallZone === "green") {
    verdict = "take"
    headline = "Good window — stats support trading"
    action = "Trade your usual setup"
  } else if (overallZone === "red") {
    verdict = "skip"
    headline = "Weak window — consider skipping"
    action = "Wait for a stronger hour or session"
  } else if (overallZone === "yellow") {
    verdict = "caution"
    headline = "Mixed window — not your best edge"
    action = "Reduce size or wait for NY Open / Overlap"
  }

  const weakest =
    session.zone === "red" || session.zone === "yellow"
      ? shortSessionLabel(session.label)
      : hour.zone === "red" || hour.zone === "yellow"
        ? hour.label
        : weekday.label

  const reason =
    overallZone === "green"
      ? `${hour.label} hour, ${weekday.label}, and ${shortSessionLabel(session.label)} look strong in your history.`
      : overallZone === "red"
        ? `${weakest} is pulling this moment into a weak zone for your account.`
        : `${shortSessionLabel(session.label)} is average (${session.winRate.toFixed(0)}%) even though other buckets may look better.`

  return {
    verdict,
    headline,
    reason,
    action,
    overallZone,
    hour: { label: hour.label, zone: zoneLabel(hour.zone), summary: hourSummary },
    day: { label: weekday.label, zone: zoneLabel(weekday.zone), summary: daySummary },
    session: {
      label: shortSessionLabel(session.label),
      zone: zoneLabel(session.zone),
      summary: sessionSummary,
    },
  }
}

export function buildFallbackTradeAdvice(options: {
  isUpdate?: boolean
} = {}): TradeMomentAdvice {
  const isUpdate = options.isUpdate ?? false
  return {
    verdict: "caution",
    headline: isUpdate ? "Trade updated on TradingView" : "New trade synced from TradingView",
    reason: isUpdate
      ? "A synced trade was updated — an open position may have closed."
      : "A new trade was imported from your TradingView extension.",
    action: "Review the trade and your session stats",
    overallZone: "neutral",
    hour: { label: "—", zone: "Neutral", summary: "Not enough history yet." },
    day: { label: "—", zone: "Neutral", summary: "Not enough history yet." },
    session: { label: "—", zone: "Neutral", summary: "Not enough history yet." },
  }
}
