"use client"

import { AlertTriangle, Sparkles, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AvoidInsight } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type Props = {
  avoidHours: AvoidInsight[]
  avoidDays: AvoidInsight[]
  avoidSessions: AvoidInsight[]
  bestHours: AvoidInsight[]
  bestDays: AvoidInsight[]
  bestSessions: AvoidInsight[]
}

function InsightList({
  items,
  variant,
}: {
  items: AvoidInsight[]
  variant: "avoid" | "best"
}) {
  if (!items.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {variant === "avoid"
          ? "No weak buckets with enough sample size."
          : "No standout edge detected yet."}
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 6).map((item) => (
        <li key={item.key} className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant={variant === "avoid" ? "destructive" : "default"}>{item.label}</Badge>
          <span className="text-muted-foreground">
            {item.trades} trades · {item.winRate.toFixed(0)}% WR ·{" "}
            <span className={item.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
              {currency.format(item.netPnl)}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

export function AvoidInsights({
  avoidHours,
  avoidDays,
  avoidSessions,
  bestHours,
  bestDays,
  bestSessions,
}: Props) {
  const hourLabels = avoidHours.slice(0, 5).map((h) => h.label).join(", ")
  const dayLabels = avoidDays.slice(0, 3).map((d) => d.label).join(", ")
  const sessionLabels = avoidSessions.slice(0, 2).map((s) => s.label).join(", ")

  const bestHour = bestHours[0]
  const bestDay = bestDays[0]
  const bestSession = bestSessions[0]

  return (
    <div className="space-y-4">
      {(hourLabels || dayLabels || sessionLabels) && (
        <Card className="border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Avoid trading
            </CardTitle>
            <CardDescription>
              Buckets with {5}+ trades and negative P&amp;L or win rate below 40%
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {hourLabels && (
              <p>
                <span className="font-medium text-rose-700 dark:text-rose-400">Hours: </span>
                {hourLabels}
              </p>
            )}
            {dayLabels && (
              <p>
                <span className="font-medium text-rose-700 dark:text-rose-400">Days: </span>
                {dayLabels}
              </p>
            )}
            {sessionLabels && (
              <p>
                <span className="font-medium text-rose-700 dark:text-rose-400">Sessions: </span>
                {sessionLabels}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {(bestHour || bestDay || bestSession) && (
        <Card className="border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-emerald-600" />
              Best edge
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {bestHour && (
              <p>
                Hour <strong>{bestHour.label}</strong> — {currency.format(bestHour.netPnl)} (
                {bestHour.trades} trades)
              </p>
            )}
            {bestDay && (
              <p>
                Day <strong>{bestDay.label}</strong> — {currency.format(bestDay.netPnl)} (
                {bestDay.trades} trades)
              </p>
            )}
            {bestSession && (
              <p>
                Session <strong>{bestSession.label}</strong> — {currency.format(bestSession.netPnl)} (
                {bestSession.trades} trades)
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Weak hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightList items={avoidHours} variant="avoid" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Weak days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightList items={avoidDays} variant="avoid" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <TrendingDown className="h-4 w-4 text-rose-500" />
              Weak sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InsightList items={avoidSessions} variant="avoid" />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
