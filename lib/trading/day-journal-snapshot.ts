import { formatHoldDuration, getTradeHoldTimeMs } from "@/lib/trading/analytics"
import { classifySession, getSessionDef, getZonedParts } from "@/lib/trading/sessions"
import { getTradeWindowFlags } from "@/lib/trading/trade-display"

export type DayJournalTradeInput = {
  instrument: string
  entry_date: string
  exit_date?: string | null
  net_pnl: number | null
}

type AvoidKeyLists = {
  hours: Array<{ key: string }>
  sessions: Array<{ key: string }>
  days: Array<{ key: string }>
}

export type DayJournalSnapshot = {
  tradeCount: number
  netPnl: number
  wins: number
  losses: number
  winRate: number | null
  sessions: Array<{ key: string; label: string; count: number; pnl: number }>
  weakHourCount: number
  weakSessionCount: number
  bestTrade: { instrument: string; pnl: number } | null
  worstTrade: { instrument: string; pnl: number } | null
  avgHoldLabel: string | null
}

export type DayJournalDraftHints = {
  whatWentWell?: string
  whatWentWrong?: string
  lessonsLearned?: string
  marketRead?: string
  tomorrowPlan?: string
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatSignedPnl(value: number) {
  const formatted = currency.format(Math.abs(value))
  if (value > 0) return `+${formatted}`
  if (value < 0) return `-${formatted}`
  return formatted
}

export function buildDayJournalSnapshot(
  trades: DayJournalTradeInput[],
  avoid: AvoidKeyLists | null | undefined,
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): DayJournalSnapshot {
  let netPnl = 0
  let wins = 0
  let losses = 0
  let bestTrade: DayJournalSnapshot["bestTrade"] = null
  let worstTrade: DayJournalSnapshot["worstTrade"] = null
  let weakHourCount = 0
  let weakSessionCount = 0
  const holdMs: number[] = []
  const sessionMap = new Map<string, { label: string; count: number; pnl: number }>()

  for (const trade of trades) {
    const pnl = typeof trade.net_pnl === "number" ? trade.net_pnl : 0
    netPnl += pnl

    if (typeof trade.net_pnl === "number") {
      if (trade.net_pnl > 0) wins += 1
      else if (trade.net_pnl < 0) losses += 1

      if (!bestTrade || trade.net_pnl > bestTrade.pnl) {
        bestTrade = { instrument: trade.instrument, pnl: trade.net_pnl }
      }
      if (!worstTrade || trade.net_pnl < worstTrade.pnl) {
        worstTrade = { instrument: trade.instrument, pnl: trade.net_pnl }
      }
    }

    const flags = getTradeWindowFlags(trade.entry_date, avoid, timezone)
    if (flags.weakHour) weakHourCount += 1
    if (flags.weakSession) weakSessionCount += 1

    const hold = getTradeHoldTimeMs(trade)
    if (hold != null) holdMs.push(hold)

    const parsed = new Date(trade.entry_date)
    if (!Number.isNaN(parsed.getTime())) {
      const { hour, minute } = getZonedParts(parsed, timezone)
      const key = classifySession(hour, minute)
      const label = getSessionDef(key).label
      const existing = sessionMap.get(key) ?? { label, count: 0, pnl: 0 }
      existing.count += 1
      existing.pnl += pnl
      sessionMap.set(key, existing)
    }
  }

  const closedWithPnl = wins + losses
  const avgHold =
    holdMs.length > 0 ? holdMs.reduce((sum, value) => sum + value, 0) / holdMs.length : null

  return {
    tradeCount: trades.length,
    netPnl,
    wins,
    losses,
    winRate: closedWithPnl > 0 ? wins / closedWithPnl : null,
    sessions: Array.from(sessionMap.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => b.count - a.count),
    weakHourCount,
    weakSessionCount,
    bestTrade,
    worstTrade,
    avgHoldLabel: avgHold != null ? formatHoldDuration(avgHold) : null,
  }
}

export type DayJournalAutofill = DayJournalDraftHints & {
  processFollowed?: "yes" | "partial" | "no"
  dayGrade?: "A" | "B" | "C" | "D" | "F"
}

/** Auto-fill draft from the day's trades. Never overwrite a saved journal. */
export function buildDayJournalDraftHints(snapshot: DayJournalSnapshot): DayJournalAutofill {
  const hints: DayJournalAutofill = {}
  const winningSessions = snapshot.sessions
    .filter((session) => session.pnl > 0)
    .sort((a, b) => b.pnl - a.pnl)
  const losingSessions = snapshot.sessions
    .filter((session) => session.pnl < 0)
    .sort((a, b) => a.pnl - b.pnl)
  const closed = snapshot.wins + snapshot.losses
  const winRatePct = snapshot.winRate != null ? Math.round(snapshot.winRate * 100) : null

  if (snapshot.tradeCount === 0) {
    hints.whatWentWell = "No trades — stayed flat and protected capital"
    hints.whatWentWrong = "Check whether sitting out was discipline or hesitation"
    hints.lessonsLearned = "Flat days are fine when there is no A+ setup"
    hints.marketRead = "Did not engage — note the tape / session character anyway"
    hints.tomorrowPlan = "Wait for A+ setups only; no force-trading"
    hints.processFollowed = "yes"
    hints.dayGrade = "B"
    return hints
  }

  const wellParts: string[] = []
  if (winningSessions.length > 0) {
    const top = winningSessions[0]
    wellParts.push(`${top.label} worked (${top.count} trade${top.count === 1 ? "" : "s"}, ${formatSignedPnl(top.pnl)})`)
  }
  if (snapshot.bestTrade && snapshot.bestTrade.pnl > 0) {
    wellParts.push(
      `best trade ${snapshot.bestTrade.instrument} ${formatSignedPnl(snapshot.bestTrade.pnl)}`,
    )
  }
  if (winRatePct != null && winRatePct >= 50 && closed >= 2) {
    wellParts.push(`${winRatePct}% win rate on ${closed} closed`)
  }
  hints.whatWentWell =
    wellParts.length > 0
      ? wellParts.join("; ")
      : `Took ${snapshot.tradeCount} trade${snapshot.tradeCount === 1 ? "" : "s"} · net ${formatSignedPnl(snapshot.netPnl)}`

  const wrongParts: string[] = []
  if (snapshot.weakHourCount > 0) {
    wrongParts.push(
      `${snapshot.weakHourCount} trade${snapshot.weakHourCount === 1 ? "" : "s"} in weak hour`,
    )
  }
  if (snapshot.weakSessionCount > 0) {
    wrongParts.push(
      `${snapshot.weakSessionCount} trade${snapshot.weakSessionCount === 1 ? "" : "s"} in weak session`,
    )
  }
  if (losingSessions.length > 0) {
    const worst = losingSessions[0]
    wrongParts.push(`${worst.label} dragged (${formatSignedPnl(worst.pnl)})`)
  }
  if (snapshot.worstTrade && snapshot.worstTrade.pnl < 0) {
    wrongParts.push(
      `worst trade ${snapshot.worstTrade.instrument} ${formatSignedPnl(snapshot.worstTrade.pnl)}`,
    )
  }
  if (snapshot.tradeCount >= 5 && snapshot.netPnl < 0) {
    wrongParts.push("high trade count on a red day — possible overtrading")
  }
  hints.whatWentWrong =
    wrongParts.length > 0
      ? wrongParts.join("; ")
      : "No major red flags from the stats — review execution quality anyway"

  if (snapshot.weakHourCount > 0 || snapshot.weakSessionCount > 0) {
    hints.lessonsLearned =
      "Skip historically weak hours/sessions unless the setup is clearly A+"
  } else if (winningSessions.length > 0 && losingSessions.length > 0) {
    hints.lessonsLearned = `Lean into ${winningSessions[0].label}; be selective in ${losingSessions[0].label}`
  } else if (snapshot.netPnl >= 0) {
    hints.lessonsLearned = "Green day — protect process tomorrow; do not give it back chasing size"
  } else {
    hints.lessonsLearned = "Red day — cut size and only take A+ setups until process is clean"
  }

  const sessionBits = snapshot.sessions.map(
    (session) => `${session.label}×${session.count} (${formatSignedPnl(session.pnl)})`,
  )
  hints.marketRead = [
    `${snapshot.tradeCount} trade${snapshot.tradeCount === 1 ? "" : "s"} · net ${formatSignedPnl(snapshot.netPnl)}`,
    winRatePct != null ? `${snapshot.wins}W/${snapshot.losses}L (${winRatePct}% WR)` : null,
    sessionBits.length ? sessionBits.join(" · ") : null,
    snapshot.avgHoldLabel ? `avg hold ${snapshot.avgHoldLabel}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  if (snapshot.weakHourCount > 0 || snapshot.weakSessionCount > 0) {
    hints.tomorrowPlan = "Avoid weak windows; only take A+ setups"
  } else if (winningSessions.length > 0) {
    hints.tomorrowPlan = `Focus on ${winningSessions[0].label}; size only when process is clean`
  } else if (snapshot.netPnl < 0) {
    hints.tomorrowPlan = "Trade smaller; wait for cleaner conditions before adding risk"
  } else {
    hints.tomorrowPlan = "Repeat today’s process; do not force extra trades"
  }

  const weakHits = snapshot.weakHourCount + snapshot.weakSessionCount
  if (weakHits === 0 && snapshot.netPnl >= 0) {
    hints.processFollowed = "yes"
  } else if (weakHits > 0 && snapshot.netPnl >= 0) {
    hints.processFollowed = "partial"
  } else if (weakHits > 0) {
    hints.processFollowed = "no"
  } else {
    hints.processFollowed = snapshot.netPnl >= 0 ? "partial" : "no"
  }

  if (snapshot.netPnl > 0 && weakHits === 0 && (winRatePct == null || winRatePct >= 50)) {
    hints.dayGrade = "A"
  } else if (snapshot.netPnl > 0) {
    hints.dayGrade = "B"
  } else if (snapshot.netPnl === 0) {
    hints.dayGrade = "C"
  } else if (weakHits > 0 || snapshot.tradeCount >= 5) {
    hints.dayGrade = "D"
  } else {
    hints.dayGrade = "C"
  }

  return hints
}

export function isDayJournalEmpty(fields: {
  whatWentWell?: string | null
  whatWentWrong?: string | null
  lessonsLearned?: string | null
  marketRead?: string | null
  tomorrowPlan?: string | null
}) {
  return (
    !fields.whatWentWell?.trim() &&
    !fields.whatWentWrong?.trim() &&
    !fields.lessonsLearned?.trim() &&
    !fields.marketRead?.trim() &&
    !fields.tomorrowPlan?.trim()
  )
}
