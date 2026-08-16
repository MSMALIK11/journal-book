"use client"

import Link from "next/link"
import { format, parseISO } from "date-fns"
import { AlertTriangle, BellRing, CheckCircle2, ExternalLink, TrendingDown, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatTradeSignal } from "@/lib/trading/trade-display"
import type { TradeMomentAdvice } from "@/lib/trading/trade-moment-advice"
import type { ImportedTradeSnapshot } from "@/lib/sync-events"

export type NewTradeAlarmState = {
  trade: ImportedTradeSnapshot
  accountName?: string
  importedCount: number
  advice: TradeMomentAdvice
}

type NewTradeAlarmModalProps = {
  open: boolean
  alarm: NewTradeAlarmState | null
  onStop: () => void
}

const VERDICT_STYLES = {
  take: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    icon: CheckCircle2,
    label: "Consider taking",
  },
  caution: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-800 dark:text-amber-300",
    icon: AlertTriangle,
    label: "Proceed with caution",
  },
  skip: {
    border: "border-rose-500/40",
    bg: "bg-rose-500/10",
    text: "text-rose-700 dark:text-rose-300",
    icon: TrendingDown,
    label: "Consider skipping",
  },
} as const

function zoneBadgeClass(zone: string) {
  if (zone === "Strong") return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
  if (zone === "Weak") return "bg-rose-500/15 text-rose-700 dark:text-rose-300"
  if (zone === "Average") return "bg-amber-500/15 text-amber-800 dark:text-amber-300"
  return "bg-muted text-muted-foreground"
}

export function NewTradeAlarmModal({ open, alarm, onStop }: NewTradeAlarmModalProps) {
  if (!alarm) return null

  const { trade, accountName, importedCount, advice } = alarm
  const verdictStyle = VERDICT_STYLES[advice.verdict]
  const VerdictIcon = verdictStyle.icon
  const isLong = trade.trade_type === "Buy"
  const entryTime = format(parseISO(trade.entry_date), "MMM d, HH:mm:ss")
  const signalLabel = formatTradeSignal(trade.signal)

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onStop()}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="h-5 w-5 text-amber-500 animate-pulse" />
            {trade.is_open === false ? "New trade synced" : "New open trade"}
          </DialogTitle>
          <DialogDescription>
            {importedCount > 1
              ? `${importedCount} new trades opened — showing the latest open position.`
              : "A new open position was detected from Live Sync."}
            {accountName ? ` Account: ${accountName}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold">{trade.instrument}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{entryTime}</p>
              </div>
              <div
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                  isLong
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-300",
                )}
              >
                {isLong ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {isLong ? "Long" : "Short"}
              </div>
            </div>
            <div className="mt-2">
              <span className="inline-flex rounded-full bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                Open
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Entry</p>
                <p className="font-medium tabular-nums">{trade.entry_price}</p>
              </div>
              {signalLabel !== "—" ? (
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Signal</p>
                  <p className="font-medium">{signalLabel}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className={cn("rounded-lg border px-3 py-3", verdictStyle.border, verdictStyle.bg)}>
            <div className="flex items-start gap-2.5">
              <VerdictIcon className={cn("h-5 w-5 shrink-0 mt-0.5", verdictStyle.text)} />
              <div>
                <p className={cn("text-sm font-semibold", verdictStyle.text)}>{advice.headline}</p>
                <p className="text-xs mt-1 leading-relaxed opacity-90">{advice.reason}</p>
                <p className="text-xs font-medium mt-2">{advice.action}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Hour", data: advice.hour },
              { label: "Day", data: advice.day },
              { label: "Session", data: advice.session },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border px-2 py-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                <p className="text-xs font-semibold mt-0.5 truncate">{item.data.label}</p>
                <span
                  className={cn(
                    "inline-block mt-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                    zoneBadgeClass(item.data.zone),
                  )}
                >
                  {item.data.zone}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <div className="grid w-full grid-cols-2 gap-2">
            <Button variant="outline" className="w-full gap-1.5" asChild>
              <Link href="/live-sync" onClick={onStop}>
                <ExternalLink className="h-4 w-4" />
                Live Sync
              </Link>
            </Button>
            <Button variant="outline" className="w-full gap-1.5" asChild>
              <Link href="/trades" onClick={onStop}>
                <ExternalLink className="h-4 w-4" />
                Trade history
              </Link>
            </Button>
          </div>
          <Button className="w-full" onClick={onStop}>
            Stop alert
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
