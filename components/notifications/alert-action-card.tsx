"use client"

import { AlertTriangle, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AlertItem } from "@/components/notifications/alert-list"

type AlertActionCardProps = {
  alert: AlertItem | null
  loading?: boolean
}

function SeverityIcon({ severity }: { severity: AlertItem["severity"] }) {
  switch (severity) {
    case "danger":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
    case "warning":
      return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
    case "success":
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
    default:
      return <Info className="h-4 w-4 shrink-0 text-sky-500" />
  }
}

const SEVERITY_BORDER: Record<AlertItem["severity"], string> = {
  danger: "border-rose-500/30 bg-rose-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  success: "border-emerald-500/30 bg-emerald-500/5",
  info: "border-sky-500/20 bg-sky-500/5",
}

export function AlertActionCard({ alert, loading }: AlertActionCardProps) {
  if (loading) {
    return (
      <div className="mx-3 mt-3 rounded-lg border border-dashed px-3 py-4">
        <p className="text-xs text-muted-foreground text-center">Loading recommendation...</p>
      </div>
    )
  }

  if (!alert) {
    return (
      <div className="mx-3 mt-3 rounded-lg border border-dashed px-3 py-4">
        <p className="text-xs text-muted-foreground text-center">No actionable alert right now.</p>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "mx-3 mt-3 rounded-lg border px-3 py-3",
        SEVERITY_BORDER[alert.severity],
      )}
    >
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground mb-1.5">
        Top recommendation
      </p>
      <div className="flex items-start gap-2.5">
        <SeverityIcon severity={alert.severity} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{alert.title}</p>
          {alert.message ? (
            <p className="text-xs text-foreground/80 mt-1 leading-relaxed">{alert.message}</p>
          ) : null}
          {alert.metric ? (
            <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">{alert.metric}</p>
          ) : null}
          {alert.action ? (
            <p className="text-xs font-medium mt-2 text-foreground/90">{alert.action}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
