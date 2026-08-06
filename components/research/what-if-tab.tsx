"use client"

import { ArrowRight, Lightbulb, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { AvoidanceImpact, AvoidanceScenario } from "@/lib/trading/avoidance-impact"
import { mistakeDimensionLabel } from "@/lib/trading/avoidance-impact"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  whatIf: AvoidanceImpact | null
}

export function WhatIfTab({ whatIf }: Props) {
  if (!whatIf) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Need at least 5 closed trades to run what-if scenarios.
        </CardContent>
      </Card>
    )
  }

  if (!whatIf.mistakes.length && !whatIf.scenarios.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          {whatIf.summary}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="h-4 w-4 text-primary" />
            What if you avoided your mistakes?
          </CardTitle>
          <CardDescription>{whatIf.summary}</CardDescription>
        </CardHeader>
      </Card>

      {whatIf.mistakes.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-600">
            Weak windows in your data
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {whatIf.mistakes.map((item) => (
              <Card
                key={`${item.dimension}-${item.label}`}
                className={cn(
                  "border-border/60",
                  item.zone === "red"
                    ? "bg-rose-500/5 border-rose-500/20"
                    : "bg-amber-500/5 border-amber-500/20",
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {mistakeDimensionLabel(item.dimension)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        item.zone === "red"
                          ? "border-rose-500/30 text-rose-600"
                          : "border-amber-500/30 text-amber-700",
                      )}
                    >
                      {item.zone === "red" ? "Weak" : "Average"}
                    </Badge>
                  </div>
                  <CardTitle className="text-base pt-1">{item.label}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <p className="tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                    {currency.format(item.netPnl)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {item.trades} trades · {item.winRate.toFixed(0)}% win rate
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {whatIf.scenarios.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-600">
            Projected improvement
          </h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {whatIf.scenarios.map((scenario) => (
              <ScenarioCard key={scenario.id} scenario={scenario} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function ScenarioCard({ scenario }: { scenario: AvoidanceScenario }) {
  const pnlBetter = scenario.delta.netPnl > 0
  const wrBetter = scenario.delta.winRate > 0
  const pfBetter = (scenario.delta.profitFactor ?? 0) > 0

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{scenario.title}</CardTitle>
        <CardDescription>{scenario.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Removes <strong className="text-foreground">{scenario.tradesRemoved}</strong> trades (
          {currency.format(scenario.removedPnl)} P&L) · Keeps {scenario.tradesKept}
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border bg-muted/20 p-3 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Actual</p>
            <p className="font-semibold tabular-nums mt-1">{currency.format(scenario.actual.netPnl)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {scenario.actual.winRate.toFixed(1)}% WR
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              PF {formatPf(scenario.actual.profitFactor)}
            </p>
          </div>

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">If avoided</p>
            <p className="font-semibold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
              {currency.format(scenario.optimized.netPnl)}
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {scenario.optimized.winRate.toFixed(1)}% WR
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              PF {formatPf(scenario.optimized.profitFactor)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <DeltaChip
            label="Net P&L"
            value={currency.format(Math.abs(scenario.delta.netPnl))}
            positive={pnlBetter}
            prefix={pnlBetter ? "+" : "−"}
          />
          <DeltaChip
            label="Win rate"
            value={`${Math.abs(scenario.delta.winRate).toFixed(1)}%`}
            positive={wrBetter}
            prefix={wrBetter ? "+" : "−"}
          />
          {scenario.delta.profitFactor != null ? (
            <DeltaChip
              label="Profit factor"
              value={Math.abs(scenario.delta.profitFactor).toFixed(2)}
              positive={pfBetter}
              prefix={pfBetter ? "+" : "−"}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function DeltaChip({
  label,
  value,
  positive,
  prefix,
}: {
  label: string
  value: string
  positive: boolean
  prefix: string
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        positive
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
          : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
      )}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3 shrink-0" />
      ) : (
        <TrendingDown className="h-3 w-3 shrink-0" />
      )}
      <span>
        {label} {prefix}
        {value}
      </span>
    </div>
  )
}

function formatPf(value: number | null) {
  if (value == null) return "—"
  if (!Number.isFinite(value)) return "∞"
  return value.toFixed(2)
}
