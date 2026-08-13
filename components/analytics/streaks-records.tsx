"use client"

import { Calendar, Clock, Flame, TrendingDown, Trophy } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
    <div className="flex items-start gap-3 rounded-xl border border-cyan-400/15 bg-[#05070a]/60 p-4">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="hud-label">{label}</p>
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
    <HudPanel>
      <HudPanelHeader title="Streaks & Records" />
      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <RecordTile icon={Flame} label="Current streak" iconClassName="text-orange-400">
          <p
            className={cn(
              "text-xl font-semibold",
              records.currentStreak.type === "win" && "text-cyan-300",
              records.currentStreak.type === "loss" && "text-rose-400",
            )}
          >
            {currentLabel}
          </p>
        </RecordTile>

        <RecordTile icon={Trophy} label="Best win streak" iconClassName="text-cyan-300">
          <p className="text-xl font-semibold text-cyan-300">
            {records.bestWinStreak} Win{records.bestWinStreak === 1 ? "" : "s"}
          </p>
        </RecordTile>

        <RecordTile icon={TrendingDown} label="Worst loss streak" iconClassName="text-rose-400">
          <p className="text-xl font-semibold text-rose-400">
            {records.worstLossStreak} Loss{records.worstLossStreak === 1 ? "" : "es"}
          </p>
        </RecordTile>

        <RecordTile icon={Calendar} label="Best day" iconClassName="text-emerald-400">
          {records.bestDay ? (
            <p className="text-xl font-semibold text-emerald-400">
              {records.bestDay.pnl >= 0 ? "+" : ""}
              {currency.format(records.bestDay.pnl)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{records.bestDay.label}</span>
            </p>
          ) : (
            <p className="text-xl font-semibold text-muted-foreground">—</p>
          )}
        </RecordTile>

        <RecordTile icon={Calendar} label="Worst day" iconClassName="text-rose-400">
          {records.worstDay ? (
            <p className="text-xl font-semibold text-rose-400">
              {currency.format(records.worstDay.pnl)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">{records.worstDay.label}</span>
            </p>
          ) : (
            <p className="text-xl font-semibold text-muted-foreground">—</p>
          )}
        </RecordTile>

        <RecordTile icon={Clock} label="Total time in trades" iconClassName="text-cyan-300/80">
          <p className="text-xl font-semibold text-cyan-100">{formatHoldDuration(records.backtestTimeMs)}</p>
          <p className="text-xs text-muted-foreground">Sum of all trade durations</p>
        </RecordTile>
      </div>
    </HudPanel>
  )
}
