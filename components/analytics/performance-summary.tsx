"use client"

import type { AnalyticsRecords, AnalyticsResult } from "@/lib/trading/analytics"
import { Card, CardContent } from "@/components/ui/card"

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
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="space-y-1 py-4">
        <p className="text-sm font-medium leading-relaxed text-foreground">{headline}</p>
        {edgeLine ? <p className="text-sm text-muted-foreground">{edgeLine}</p> : null}
        {streakLine ? <p className="text-sm text-muted-foreground">{streakLine}</p> : null}
      </CardContent>
    </Card>
  )
}
