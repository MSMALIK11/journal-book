"use client"

import { Calendar, Clock, Flame, TrendingDown, Trophy } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatHoldDuration, type AnalyticsRecords, type StreakEpisode } from "@/lib/trading/analytics"
import { formatTradeEntryDateTime, tradeSideLabel } from "@/lib/trading/trade-display"
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

function StreakTradesTable({ episode }: { episode: StreakEpisode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cyan-400/10">
      <Table>
        <TableHeader>
          <TableRow className="border-cyan-400/10 hover:bg-transparent">
            <TableHead className="text-muted-foreground">Exit time</TableHead>
            <TableHead className="text-muted-foreground">Symbol</TableHead>
            <TableHead className="text-muted-foreground">Side</TableHead>
            <TableHead className="text-muted-foreground">P&amp;L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {episode.trades.map((trade) => (
            <TableRow key={trade.id || `${trade.instrument}-${trade.exit_date}`} className="border-cyan-400/10">
              <TableCell className="whitespace-nowrap text-sm">
                {formatTradeEntryDateTime(trade.exit_date || trade.entry_date)}
              </TableCell>
              <TableCell className="font-medium">{trade.instrument}</TableCell>
              <TableCell>
                <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                  {tradeSideLabel(trade.trade_type as "Buy" | "Sell")}
                </Badge>
              </TableCell>
              <TableCell
                className={cn(
                  "tabular-nums font-medium",
                  trade.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {currency.format(trade.net_pnl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function StreakEpisodePanel({
  title,
  episode,
  variant,
  icon: Icon,
}: {
  title: string
  episode: StreakEpisode | null
  variant: "win" | "loss"
  icon: React.ComponentType<{ className?: string }>
}) {
  if (!episode?.trades.length) return null

  const positive = variant === "win"
  return (
    <HudPanel glow={positive ? "green" : "red"}>
      <HudPanelHeader
        title={title}
        description={`${episode.count} trade${episode.count === 1 ? "" : "s"} · ${currency.format(episode.totalPnl)} total`}
        action={<Icon className={cn("h-4 w-4", positive ? "text-cyan-300" : "text-rose-400")} />}
      />
      <div className="space-y-3 px-4 pb-4">
        <Badge
          variant="outline"
          className={cn(
            positive ? "border-emerald-400/30 text-emerald-300" : "border-rose-400/30 text-rose-300",
          )}
        >
          {positive ? "Consecutive winners" : "Consecutive losers"} from{" "}
          {formatTradeEntryDateTime(episode.trades[0].exit_date || episode.trades[0].entry_date)} to{" "}
          {formatTradeEntryDateTime(
            episode.trades[episode.trades.length - 1].exit_date ||
              episode.trades[episode.trades.length - 1].entry_date,
          )}
        </Badge>
        <StreakTradesTable episode={episode} />
      </div>
    </HudPanel>
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
    <div className="space-y-4">
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
            {records.bestWinStreakEpisode ? (
              <p className="text-xs text-muted-foreground">
                {currency.format(records.bestWinStreakEpisode.totalPnl)} across streak
              </p>
            ) : null}
          </RecordTile>

          <RecordTile icon={TrendingDown} label="Worst loss streak" iconClassName="text-rose-400">
            <p className="text-xl font-semibold text-rose-400">
              {records.worstLossStreak} Loss{records.worstLossStreak === 1 ? "" : "es"}
            </p>
            {records.worstLossStreakEpisode ? (
              <p className="text-xs text-muted-foreground">
                {currency.format(records.worstLossStreakEpisode.totalPnl)} across streak
              </p>
            ) : null}
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

      {(records.bestWinStreakEpisode?.trades.length || records.worstLossStreakEpisode?.trades.length) ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <StreakEpisodePanel
            title="Best win streak trades"
            episode={records.bestWinStreakEpisode}
            variant="win"
            icon={Trophy}
          />
          <StreakEpisodePanel
            title="Worst loss streak trades"
            episode={records.worstLossStreakEpisode}
            variant="loss"
            icon={TrendingDown}
          />
        </div>
      ) : null}
    </div>
  )
}
