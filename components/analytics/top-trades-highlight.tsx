"use client"

import { format } from "date-fns"
import { TrendingDown, TrendingUp } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { TopTradeEntry, TradeExtremes } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type Props = {
  topWinners: TopTradeEntry[]
  topLosers: TopTradeEntry[]
  extremes: TradeExtremes
  timezone?: string
}

function formatTradeDate(iso: string | null, timezone?: string) {
  if (!iso) return "—"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return "—"
  if (timezone) {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date)
  }
  return format(date, "MMM d, HH:mm")
}

function formatPrice(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString("en-US", { maximumFractionDigits: 5 })
}

function formatReturn(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "—"
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

function TradeTable({
  trades,
  variant,
  timezone,
}: {
  trades: TopTradeEntry[]
  variant: "win" | "loss"
  timezone?: string
}) {
  if (!trades.length) {
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">
        No {variant === "win" ? "winning" : "losing"} trades in this filter.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-cyan-400/10 hover:bg-transparent">
            <TableHead className="text-muted-foreground">#</TableHead>
            <TableHead className="text-muted-foreground">Symbol</TableHead>
            <TableHead className="text-muted-foreground">Side</TableHead>
            <TableHead className="text-muted-foreground">Entry → Exit</TableHead>
            <TableHead className="text-right text-muted-foreground">P&L</TableHead>
            <TableHead className="text-right text-muted-foreground">Return</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade, index) => {
            const isLong = trade.trade_type === "Buy"
            return (
              <TableRow key={trade.id || `${trade.instrument}-${trade.entry_date}-${index}`} className="border-cyan-400/10">
                <TableCell className="text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="font-medium">{trade.instrument}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-xs font-medium",
                      isLong ? "bg-emerald-400/10 text-emerald-400" : "bg-rose-400/10 text-rose-400",
                    )}
                  >
                    {isLong ? "Long" : "Short"}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                  <div>{formatTradeDate(trade.entry_date, timezone)}</div>
                  <div>
                    {formatPrice(trade.entry_price)} → {formatPrice(trade.exit_price)}
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-semibold",
                    variant === "win" ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {variant === "win" ? "+" : ""}
                  {currency.format(trade.net_pnl)}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{formatReturn(trade.return_pct)}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export function TopTradesHighlight({ topWinners, topLosers, extremes, timezone }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3">
          <div className="flex items-center gap-2 text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <span className="hud-label">Max single win</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-emerald-300">
            {extremes.maxWin > 0 ? `+${currency.format(extremes.maxWin)}` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 px-4 py-3">
          <div className="flex items-center gap-2 text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <span className="hud-label">Max single loss</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-rose-300">
            {extremes.maxLoss < 0 ? currency.format(extremes.maxLoss) : "—"}
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <HudPanel>
          <HudPanelHeader
            title="Top 10 winning trades"
            subtitle="Best single-trade results in this filter"
          />
          <TradeTable trades={topWinners} variant="win" timezone={timezone} />
        </HudPanel>

        <HudPanel>
          <HudPanelHeader
            title="Top 10 losing trades"
            subtitle="Worst single-trade drawdowns — your max loss per trade"
          />
          <TradeTable trades={topLosers} variant="loss" timezone={timezone} />
        </HudPanel>
      </div>
    </div>
  )
}
