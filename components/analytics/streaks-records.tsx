"use client"

import { Calendar, Clock, Flame, Hourglass, TrendingDown, Trophy } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatHoldDuration, type AnalyticsRecords } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type Props = {
  records: AnalyticsRecords
}

function RecordTile({
  icon: Icon,
  label,
  children,
  iconClassName,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
  iconClassName?: string
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {children}
      </div>
    </div>
  )
}

export function StreaksRecords({ records }: Props) {
  const currentLabel =
    records.currentStreak.type === "win"
      ? `${records.currentStreak.count} Win${records.currentStreak.count === 1 ? "" : "s"}`
      : records.currentStreak.type === "loss"
        ? `${records.currentStreak.count} Loss${records.currentStreak.count === 1 ? "" : "es"}`
        : "—"

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold uppercase tracking-wide">Streaks &amp; Records</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          <RecordTile icon={Flame} label="Current streak" iconClassName="text-orange-500">
            <p
              className={cn(
                "text-xl font-bold",
                records.currentStreak.type === "win" && "text-sky-600 dark:text-sky-400",
                records.currentStreak.type === "loss" && "text-rose-600 dark:text-rose-400",
              )}
            >
              {currentLabel}
            </p>
          </RecordTile>

          <RecordTile icon={Trophy} label="Best win streak" iconClassName="text-sky-500">
            <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
              {records.bestWinStreak} Win{records.bestWinStreak === 1 ? "" : "s"}
            </p>
          </RecordTile>

          <RecordTile icon={TrendingDown} label="Worst loss streak" iconClassName="text-rose-500">
            <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
              {records.worstLossStreak} Loss{records.worstLossStreak === 1 ? "" : "es"}
            </p>
          </RecordTile>

          <RecordTile icon={Calendar} label="Best day" iconClassName="text-sky-500">
            {records.bestDay ? (
              <p className="text-xl font-bold text-sky-600 dark:text-sky-400">
                {records.bestDay.pnl >= 0 ? "+" : ""}
                {currency.format(records.bestDay.pnl)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{records.bestDay.label}</span>
              </p>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </RecordTile>

          <RecordTile icon={Calendar} label="Worst day" iconClassName="text-rose-500">
            {records.worstDay ? (
              <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                {currency.format(records.worstDay.pnl)}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{records.worstDay.label}</span>
              </p>
            ) : (
              <p className="text-xl font-bold text-muted-foreground">—</p>
            )}
          </RecordTile>

          <RecordTile icon={Clock} label="Time backtesting" iconClassName="text-muted-foreground">
            <p className="text-xl font-bold">{formatHoldDuration(records.backtestTimeMs)}</p>
            <p className="text-xs text-muted-foreground">Total time in open trades</p>
          </RecordTile>

          <RecordTile icon={Hourglass} label="Avg hold time" iconClassName="text-violet-500">
            <p className="text-xl font-bold">{formatHoldDuration(records.avgHoldTimeMs)}</p>
            <p className="text-xs text-muted-foreground">
              {records.holdTimeTrades > 0
                ? `Per trade · Wins ${formatHoldDuration(records.avgHoldTimeWinMs)} · Losses ${formatHoldDuration(records.avgHoldTimeLossMs)}`
                : "Needs entry & exit times"}
            </p>
          </RecordTile>
        </div>
      </CardContent>
    </Card>
  )
}
