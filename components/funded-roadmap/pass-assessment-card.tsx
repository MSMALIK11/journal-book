"use client"

import { CheckCircle2, AlertTriangle, XCircle, HelpCircle } from "lucide-react"
import { FundedRoadmapTermHelp } from "@/components/funded-roadmap/funded-roadmap-help"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import {
  formatDays,
  type ChallengeAssessment,
  type ChallengePassCheck,
  type FundedChallengeRules,
  type PassLikelihood,
  type StageProjection,
} from "@/lib/trading/funded-roadmap"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function formatTrades(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—"
  return Math.round(value).toLocaleString("en-US")
}

function likelihoodMeta(likelihood: PassLikelihood) {
  switch (likelihood) {
    case "high":
      return {
        label: "Likely pass",
        hint: "Data supports attempting this challenge at planned 1R.",
        glow: "green" as const,
        badgeClass: "border-emerald-400/40 text-emerald-200 bg-emerald-400/10",
        Icon: CheckCircle2,
        iconClass: "text-emerald-400",
      }
    case "medium":
      return {
        label: "Maybe — stay strict",
        hint: "Edge exists but not guaranteed. Use conservative risk and daily stops.",
        glow: "cyan" as const,
        badgeClass: "border-amber-400/40 text-amber-200 bg-amber-400/10",
        Icon: AlertTriangle,
        iconClass: "text-amber-400",
      }
    case "low":
      return {
        label: "Unlikely pass",
        hint: "Fix warnings below or lower risk before taking a challenge.",
        glow: "red" as const,
        badgeClass: "border-rose-400/40 text-rose-200 bg-rose-400/10",
        Icon: XCircle,
        iconClass: "text-rose-400",
      }
    default:
      return {
        label: "Not ready",
        hint: "Need more trades or positive expectancy before funding.",
        glow: "red" as const,
        badgeClass: "border-rose-400/40 text-rose-200 bg-rose-400/10",
        Icon: XCircle,
        iconClass: "text-rose-400",
      }
  }
}

function checkIcon(status: ChallengePassCheck["status"]) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
  if (status === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
  return <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
}

type Props = {
  accountName: string
  stage: StageProjection
  assessment: ChallengeAssessment
  rules: FundedChallengeRules
}

export function PassAssessmentCard({ accountName, stage, assessment, rules }: Props) {
  if (!assessment) return null

  const meta = likelihoodMeta(assessment.likelihood)
  const MetaIcon = meta.Icon

  return (
    <HudPanel glow={meta.glow} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <MetaIcon className={cn("mt-0.5 h-8 w-8 shrink-0", meta.iconClass)} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="hud-label">Can you pass?</p>
              <FundedRoadmapTermHelp term="pass-verdict" label="How is pass likelihood decided?" />
            </div>
            <h2 className="mt-1 text-xl font-semibold text-cyan-50">{assessment.headline}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {accountName} · {stage.label} challenge · target {currency.format(stage.profitTarget)} (
              {stage.targetR.toFixed(1)}R)
            </p>
          </div>
        </div>
        <Badge variant="outline" className={meta.badgeClass}>
          {meta.label}
        </Badge>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-cyan-100/90">{assessment.summary}</p>
      <p className="mt-2 text-xs text-muted-foreground">{meta.hint}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Best case</p>
          <p className="mt-1 text-lg font-semibold text-emerald-300">
            {formatTrades(assessment.planTrades.optimistic)} trades
          </p>
          <p className="text-xs text-muted-foreground">{formatDays(assessment.planDays.optimistic)}</p>
        </div>
        <div className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Plan around (median)</p>
          <p className="mt-1 text-lg font-semibold text-cyan-200">
            {formatTrades(assessment.planTrades.base)} trades
          </p>
          <p className="text-xs text-muted-foreground">{formatDays(assessment.planDays.base)}</p>
        </div>
        <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Conservative</p>
          <p className="mt-1 text-lg font-semibold text-amber-200">
            {formatTrades(assessment.planTrades.conservative)} trades
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDays(assessment.planDays.conservative)} · min {rules.minTradingDays} days
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        {assessment.checks.map((check) => (
          <div
            key={check.id}
            className="flex items-start gap-2 rounded-lg border border-white/10 px-3 py-2.5"
          >
            {checkIcon(check.status)}
            <div className="min-w-0">
              <p className="text-sm font-medium text-cyan-100">{check.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs">
        <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
          Use {assessment.suggestedRiskPct.toFixed(2)}% risk (recommended)
        </Badge>
        <Badge variant="outline" className="border-white/15 text-muted-foreground">
          Conservative {assessment.conservativeRiskPct.toFixed(2)}%
        </Badge>
        <Badge variant="outline" className="border-white/15 text-muted-foreground">
          Daily stop {currency.format(stage.dailyLossCap)} ({rules.dailyDrawdownPct}%)
        </Badge>
      </div>

      <p className="mt-4 flex items-start gap-1.5 text-xs text-muted-foreground">
        <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Projection from your closed trades at planned 1R ({currency.format(stage.oneR)}/trade). Not a live
        funded account guarantee — use conservative row when deciding if you can pass.
      </p>
    </HudPanel>
  )
}
