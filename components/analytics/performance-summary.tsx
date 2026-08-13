"use client"

import type { AnalyticsRecords, AnalyticsResult } from "@/lib/trading/analytics"
import { HudPanel } from "@/components/dashboard/hud-panel"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  overview: AnalyticsResult["overview"]
  records: AnalyticsRecords
  bestSession?: { label: string } | null
  weakestDay?: { label: string } | null
}

export function PerformanceSummary({ overview, records, bestSession, weakestDay }: Props) {
  const pf =
    overview.profitFactor === Infinity
      ? "∞"
      : overview.profitFactor.toFixed(1)

  const headline = `${overview.netPnl >= 0 ? "Net profit" : "Net loss"} ${currency.format(Math.abs(overview.netPnl))} across ${overview.closedTrades} closed trades · ${overview.winRate.toFixed(0)}% win rate · Profit factor ${pf}`

  const streakLine =
    records.currentStreak.type === "win"
      ? `Currently on a ${records.currentStreak.count}-trade win streak.`
      : records.currentStreak.type === "loss"
        ? `Currently on a ${records.currentStreak.count}-trade loss streak — review recent setups.`
        : null

  const edgeParts: string[] = []
  if (bestSession) edgeParts.push(`Best edge: ${bestSession.label}`)
  if (weakestDay) edgeParts.push(`Weakest: ${weakestDay.label}`)
  const edgeLine = edgeParts.length ? edgeParts.join(" · ") : null

  return (
    <HudPanel glow={overview.netPnl >= 0 ? "green" : "red"} className="px-5 py-4">
      <p className="hud-label mb-2">Performance summary</p>
      <p className="text-sm font-medium leading-relaxed text-cyan-100">{headline}</p>
      {edgeLine ? <p className="mt-1 text-sm text-muted-foreground">{edgeLine}</p> : null}
      {streakLine ? <p className="mt-1 text-sm text-muted-foreground">{streakLine}</p> : null}
    </HudPanel>
  )
}
