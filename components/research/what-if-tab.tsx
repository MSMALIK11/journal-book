"use client"

import { ArrowRight, Lightbulb, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
      <HudPanel className="p-8 text-center text-sm text-muted-foreground">
        Need at least 5 closed trades to run what-if scenarios.
      </HudPanel>
    )
  }

  if (!whatIf.mistakes.length && !whatIf.scenarios.length) {
    return (
      <HudPanel className="p-8 text-center text-sm text-muted-foreground">
        {whatIf.summary}
      </HudPanel>
    )
  }

  return (
    <div className="space-y-6">
      <HudPanel className="px-5 py-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-cyan-100">
          <Lightbulb className="h-4 w-4 text-cyan-300" />
          What if you avoided your mistakes?
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{whatIf.summary}</p>
      </HudPanel>

      {whatIf.mistakes.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-400">
            Weak windows in your data
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {whatIf.mistakes.map((item) => (
              <HudPanel
                key={`${item.dimension}-${item.label}`}
                glow={item.zone === "red" ? "red" : "cyan"}
                className="p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="border-cyan-400/20 text-[10px] text-cyan-300/80">
                    {mistakeDimensionLabel(item.dimension)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      item.zone === "red"
                        ? "border-rose-400/30 text-rose-400"
                        : "border-amber-400/30 text-amber-300",
                    )}
                  >
                    {item.zone === "red" ? "Weak" : "Average"}
                  </Badge>
                </div>
                <p className="mt-3 text-base font-semibold">{item.label}</p>
                <p className="mt-2 tabular-nums font-semibold text-rose-400">
                  {currency.format(item.netPnl)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.trades} trades · {item.winRate.toFixed(0)}% win rate
                </p>
              </HudPanel>
            ))}
          </div>
        </section>
      ) : null}

      {whatIf.scenarios.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">
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
    <HudPanel glow="green">
      <HudPanelHeader title={scenario.title} description={scenario.description} />
      <div className="space-y-4 p-5">
        <p className="text-xs text-muted-foreground">
          Removes <strong className="text-foreground">{scenario.tradesRemoved}</strong> trades (
          {currency.format(scenario.removedPnl)} P&L) · Keeps {scenario.tradesKept}
        </p>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-xl border border-cyan-400/15 bg-[#05070a]/60 p-3 text-sm">
          <div>
            <p className="hud-label">Actual</p>
            <p className="mt-1 font-semibold tabular-nums">{currency.format(scenario.actual.netPnl)}</p>
            <p className="text-xs text-muted-foreground tabular-nums">
              {scenario.actual.winRate.toFixed(1)}% WR
            </p>
            <p className="text-xs text-muted-foreground tabular-nums">
              PF {formatPf(scenario.actual.profitFactor)}
            </p>
          </div>

          <ArrowRight className="h-4 w-4 text-cyan-400/60 shrink-0" />

          <div>
            <p className="hud-label">If avoided</p>
            <p className="mt-1 font-semibold tabular-nums text-emerald-400">
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
      </div>
    </HudPanel>
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
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-rose-400/30 bg-rose-500/10 text-rose-300",
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
