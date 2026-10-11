"use client"

import { ShieldCheck, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { formatR, type RiskPlanSummary } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  riskPlan: RiskPlanSummary | null
}

export function PlanAdherence({ riskPlan }: Props) {
  if (!riskPlan || riskPlan.coverage === 0) return null

  const outcomesTotal =
    riskPlan.outcomes.targetHit +
    riskPlan.outcomes.stopHit +
    riskPlan.outcomes.manualClose +
    riskPlan.outcomes.unknown
  const knownOutcomes = outcomesTotal - riskPlan.outcomes.unknown

  const adherenceColor =
    riskPlan.adherencePct === null
      ? ""
      : riskPlan.adherencePct >= 70
        ? "text-emerald-400"
        : riskPlan.adherencePct >= 40
          ? "text-amber-400"
          : "text-rose-400"

  return (
    <HudPanel>
      <HudPanelHeader
        title="Plan adherence"
        description="How consistently you set stops/targets and whether trades hit them"
        action={
          riskPlan.coverage < 0.5 ? (
            <Badge variant="outline" className="border-amber-400/40 text-amber-400 text-[10px]">
              <ShieldAlert className="mr-1 h-3 w-3" />
              low coverage
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-400/40 text-emerald-400 text-[10px]">
              <ShieldCheck className="mr-1 h-3 w-3" />
              {(riskPlan.coverage * 100).toFixed(0)}% have stops
            </Badge>
          )
        }
      />
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MetricCell
            label="Avg Risk %"
            value={riskPlan.avgRiskPct !== null ? `${riskPlan.avgRiskPct.toFixed(2)}%` : "—"}
            sub={riskPlan.medianRiskPct !== null ? `Median ${riskPlan.medianRiskPct.toFixed(2)}%` : undefined}
          />
          <MetricCell
            label="Risk spread"
            value={riskPlan.riskPctSpread !== null ? `${riskPlan.riskPctSpread.toFixed(2)}%` : "—"}
            sub="p90 − p10"
          />
          <MetricCell
            label="Planned R:R"
            value={riskPlan.plannedRrAvg !== null ? formatR(riskPlan.plannedRrAvg) : "—"}
            sub={`Realized ${riskPlan.realizedRrAvg !== null ? formatR(riskPlan.realizedRrAvg) : "—"}`}
          />
          <MetricCell
            label="Adherence"
            value={riskPlan.adherencePct !== null ? `${riskPlan.adherencePct.toFixed(0)}%` : "—"}
            sub={knownOutcomes ? `${knownOutcomes} classified outcomes` : undefined}
            valueClass={adherenceColor}
          />
        </div>

        {knownOutcomes > 0 && (
          <div className="flex flex-wrap gap-2">
            <OutcomeBadge
              label="Target hit"
              count={riskPlan.outcomes.targetHit}
              total={knownOutcomes}
              color="emerald"
            />
            <OutcomeBadge
              label="Stop hit"
              count={riskPlan.outcomes.stopHit}
              total={knownOutcomes}
              color="rose"
            />
            <OutcomeBadge
              label="Manual"
              count={riskPlan.outcomes.manualClose}
              total={knownOutcomes}
              color="amber"
            />
          </div>
        )}

        <p className="text-[10px] text-muted-foreground">
          Basis: {riskPlan.riskPctBasis === "account_balance" ? "per-trade account balance" : "initial capital"}
          {" "}&middot; Risked total {currency.format(riskPlan.riskedTotal)}
        </p>

        {riskPlan.riskPctDistribution && riskPlan.riskPctDistribution.length > 0 && (
          <div>
            <p className="hud-label mb-2">Risk % distribution</p>
            <div className="flex items-end gap-1 h-[80px]">
              {(() => {
                const max = Math.max(...riskPlan.riskPctDistribution!.map((d) => d.count), 1)
                return riskPlan.riskPctDistribution!.map((d, i) => (
                  <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                    <div
                      className="w-full rounded-t bg-cyan-400/60 transition-all"
                      style={{ height: `${(d.count / max) * 64}px` }}
                    />
                    <p className="mt-1 text-[9px] text-muted-foreground truncate w-full text-center">
                      {d.label}
                    </p>
                  </div>
                ))
              })()}
            </div>
          </div>
        )}
      </div>
    </HudPanel>
  )
}

function MetricCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-cyan-400/10 p-3">
      <p className="hud-label">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${valueClass || "text-cyan-100"}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  )
}

function OutcomeBadge({
  label,
  count,
  total,
  color,
}: {
  label: string
  count: number
  total: number
  color: "emerald" | "rose" | "amber"
}) {
  const pct = total ? ((count / total) * 100).toFixed(0) : "0"
  const colorClass =
    color === "emerald"
      ? "border-emerald-400/30 text-emerald-400"
      : color === "rose"
        ? "border-rose-400/30 text-rose-400"
        : "border-amber-400/30 text-amber-400"
  return (
    <Badge variant="outline" className={`text-[10px] ${colorClass}`}>
      {label} {count} ({pct}%)
    </Badge>
  )
}
