"use client"

import { AlertTriangle, CheckCircle2, OctagonX, ShieldAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CoachingVerdict, CoachingVerdictLevel } from "@/lib/trading/coaching-verdict"

type CoachingVerdictCardProps = {
  verdict: CoachingVerdict | null
  loading?: boolean
  compact?: boolean
  className?: string
}

const LEVEL_STYLES: Record<
  CoachingVerdictLevel,
  { border: string; bg: string; text: string }
> = {
  stop: {
    border: "border-rose-500/35",
    bg: "bg-rose-500/8",
    text: "text-rose-600",
  },
  caution: {
    border: "border-amber-500/35",
    bg: "bg-amber-500/8",
    text: "text-amber-700",
  },
  go: {
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/8",
    text: "text-emerald-700",
  },
}

function LevelIcon({ level }: { level: CoachingVerdictLevel }) {
  switch (level) {
    case "stop":
      return <OctagonX className="h-4 w-4 shrink-0 text-rose-500" />
    case "caution":
      return <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
    default:
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
  }
}

export function CoachingVerdictCard({
  verdict,
  loading,
  compact,
  className,
}: CoachingVerdictCardProps) {
  if (loading) {
    return (
      <div className={cn("rounded-lg border border-dashed px-3 py-4", className)}>
        <p className="text-xs text-muted-foreground text-center">Loading coaching verdict...</p>
      </div>
    )
  }

  if (!verdict) {
    return (
      <div className={cn("rounded-lg border border-dashed px-3 py-4", className)}>
        <p className="text-xs text-muted-foreground text-center">Not enough trade data yet.</p>
      </div>
    )
  }

  const styles = LEVEL_STYLES[verdict.level]

  return (
    <div className={cn("rounded-lg border px-3 py-3", styles.border, styles.bg, className)}>
      <div className="flex items-start gap-2.5">
        <LevelIcon level={verdict.level} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm font-semibold leading-tight", styles.text)}>{verdict.headline}</p>
          {!compact && verdict.action ? (
            <p className="text-xs text-foreground/80 mt-1.5 leading-relaxed">{verdict.action}</p>
          ) : null}
          {!compact && verdict.reasons.length > 0 ? (
            <ul className="mt-2.5 space-y-1.5">
              {verdict.reasons.map((reason) => (
                <li key={reason.title} className="flex items-start gap-1.5 text-xs text-foreground/85">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                  <span>
                    <span className="font-medium">{reason.title}</span>
                    {reason.metric ? (
                      <span className="block text-[11px] text-muted-foreground tabular-nums mt-0.5">
                        {reason.metric}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
