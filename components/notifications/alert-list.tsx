"use client"

import { AlertTriangle, Bell, CheckCircle2, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export type AlertItem = {
  id: string
  key: string
  category: string
  severity: "danger" | "warning" | "success" | "info"
  title: string
  message: string
  metric?: string
  action?: string
  read: boolean
  triggeredAt: string
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

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

type AlertListProps = {
  items: AlertItem[]
  emptyMessage?: string
  onItemClick?: (item: AlertItem) => void
}

export function AlertList({ items, emptyMessage, onItemClick }: AlertListProps) {
  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <Bell className="h-7 w-7 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">{emptyMessage || "No alerts right now."}</p>
      </div>
    )
  }

  return (
    <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
      {items.map((item) => (
        <li key={item.id || item.key}>
          <button
            type="button"
            onClick={() => onItemClick?.(item)}
            className={cn(
              "w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
              !item.read && "border-primary/25 bg-primary/5",
            )}
          >
            <div className="flex items-start gap-2.5">
              <SeverityIcon severity={item.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-tight">{item.title}</p>
                {item.message ? (
                  <p className="text-xs text-foreground/80 mt-1 leading-relaxed">{item.message}</p>
                ) : null}
                {item.metric ? (
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">{item.metric}</p>
                ) : null}
                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatTime(item.triggeredAt)}</p>
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}
