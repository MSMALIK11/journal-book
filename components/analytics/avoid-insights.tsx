"use client"

import { AlertTriangle, Sparkles, TrendingDown } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
          <Badge
            variant="outline"
            className={
              variant === "avoid"
                ? "border-rose-400/30 text-rose-300"
                : "border-emerald-400/30 text-emerald-300"
            }
          >
            {item.label}
          </Badge>
          <span className="text-muted-foreground">
            {item.trades} trades · {item.winRate.toFixed(0)}% WR ·{" "}
            <span className={item.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
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
        <HudPanel glow="red">
          <HudPanelHeader
            title="Avoid trading"
            description="Buckets with 5+ trades and negative P&L or win rate below 40%"
            action={<AlertTriangle className="h-4 w-4 text-amber-400" />}
          />
          <div className="space-y-2 px-5 py-4 text-sm">
            {hourLabels && (
              <p>
                <span className="font-medium text-rose-400">Hours: </span>
                {hourLabels}
              </p>
            )}
            {dayLabels && (
              <p>
                <span className="font-medium text-rose-400">Days: </span>
                {dayLabels}
              </p>
            )}
            {sessionLabels && (
              <p>
                <span className="font-medium text-rose-400">Sessions: </span>
                {sessionLabels}
              </p>
            )}
          </div>
        </HudPanel>
      )}

      {(bestHour || bestDay || bestSession) && (
        <HudPanel glow="green">
          <HudPanelHeader
            title="Best edge"
            action={<Sparkles className="h-4 w-4 text-emerald-400" />}
          />
          <div className="space-y-1 px-5 py-4 text-sm">
            {bestHour && (
              <p>
                Hour <strong className="text-cyan-200">{bestHour.label}</strong> — {currency.format(bestHour.netPnl)} (
                {bestHour.trades} trades)
              </p>
            )}
            {bestDay && (
              <p>
                Day <strong className="text-cyan-200">{bestDay.label}</strong> — {currency.format(bestDay.netPnl)} (
                {bestDay.trades} trades)
              </p>
            )}
            {bestSession && (
              <p>
                Session <strong className="text-cyan-200">{bestSession.label}</strong> — {currency.format(bestSession.netPnl)} (
                {bestSession.trades} trades)
              </p>
            )}
          </div>
        </HudPanel>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <HudPanel glow="red">
          <HudPanelHeader
            title="Weak hours"
            action={<TrendingDown className="h-4 w-4 text-rose-400" />}
          />
          <div className="p-4">
            <InsightList items={avoidHours} variant="avoid" />
          </div>
        </HudPanel>

        <HudPanel glow="red">
          <HudPanelHeader
            title="Weak days"
            action={<TrendingDown className="h-4 w-4 text-rose-400" />}
          />
          <div className="p-4">
            <InsightList items={avoidDays} variant="avoid" />
          </div>
        </HudPanel>

        <HudPanel glow="red">
          <HudPanelHeader
            title="Weak sessions"
            action={<TrendingDown className="h-4 w-4 text-rose-400" />}
          />
          <div className="p-4">
            <InsightList items={avoidSessions} variant="avoid" />
          </div>
        </HudPanel>
      </div>
    </div>
  )
}
