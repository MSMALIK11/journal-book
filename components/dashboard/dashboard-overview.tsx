"use client"

import Link from "next/link"
import { format, parseISO, startOfDay } from "date-fns"
import { ArrowRight, Radio } from "lucide-react"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTradeSignal } from "@/lib/trading/trade-display"
import { cn } from "@/lib/utils"

export type DashboardTrade = {
  id: string
  entry_date: string
  exit_date?: string | null
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_price: number
  exit_price?: number | null
  net_pnl?: number | null
  stop_loss?: number | null
  target?: number | null
  signal?: string | null
  is_open?: boolean
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function isOpenTrade(trade: DashboardTrade) {
  if (trade.is_open === true) return true
  if (trade.is_open === false) return false
  return !trade.exit_date
}

function formatLevel(value: number | null | undefined, instrument: string) {
  if (value == null || !Number.isFinite(value)) return "—"
  const metal = /XAU|XAG|GOLD|SILVER|PAXG/i.test(instrument)
  const digits = metal ? 2 : value >= 1000 ? 2 : 4
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatEntryTime(entryDate: string) {
  try {
    return format(parseISO(entryDate), "MMM d, HH:mm")
  } catch {
    return "—"
  }
}

export function useDashboardTradeStats(trades: DashboardTrade[]) {
  const openTrades = trades.filter(isOpenTrade).sort((a, b) => {
    const aMs = Date.parse(a.entry_date)
    const bMs = Date.parse(b.entry_date)
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
  })

  const todayClosed = trades.filter((trade) => {
    if (isOpenTrade(trade)) return false
    if (!trade.exit_date) return false
    try {
      return parseISO(trade.exit_date) >= startOfDay(new Date())
    } catch {
      return false
    }
  })

  const todayWins = todayClosed.filter((trade) => (trade.net_pnl ?? 0) > 0)
  const todayLosses = todayClosed.filter((trade) => (trade.net_pnl ?? 0) < 0)
  const todayPnl = todayClosed.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
  const todayTrades = [...todayClosed].sort((a, b) => {
    const aMs = a.exit_date ? Date.parse(a.exit_date) : 0
    const bMs = b.exit_date ? Date.parse(b.exit_date) : 0
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0)
  })

  return {
    openTrades,
    todayTrades,
    todayClosedCount: todayClosed.length,
    todayWins: todayWins.length,
    todayLosses: todayLosses.length,
    todayPnl,
  }
}

type DashboardTodayStatsProps = {
  loading: boolean
  todayPnl: number
  todayTrades: number
  todayWins: number
  todayLosses: number
  openCount: number
}

export function DashboardTodayStats({
  loading,
  todayPnl,
  todayTrades,
  todayWins,
  todayLosses,
  openCount,
}: DashboardTodayStatsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <HudPanel glow={todayPnl >= 0 ? "green" : "red"} className="p-5">
        <p className="hud-label">Today P&amp;L</p>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-28" />
        ) : (
          <p
            className={cn(
              "mt-2 text-3xl font-semibold tracking-tight",
              todayPnl >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {todayPnl >= 0 ? "+" : ""}
            {money.format(todayPnl)}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Closed trades today · selected account</p>
      </HudPanel>

      <HudPanel className="p-5">
        <p className="hud-label">Today trades</p>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tracking-tight text-cyan-100">{todayTrades}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Exits logged today</p>
      </HudPanel>

      <HudPanel glow="green" className="p-5">
        <p className="hud-label">Wins today</p>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tracking-tight text-emerald-400">{todayWins}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">Profitable closes</p>
      </HudPanel>

      <HudPanel glow="red" className="p-5">
        <p className="hud-label">Losses today</p>
        {loading ? (
          <Skeleton className="mt-3 h-8 w-16" />
        ) : (
          <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-400">{todayLosses}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {openCount > 0 ? `${openCount} open across all symbols` : "No open trades"}
        </p>
      </HudPanel>
    </section>
  )
}

type DashboardTodayTradesProps = {
  loading: boolean
  trades: DashboardTrade[]
}

export function DashboardTodayTrades({ loading, trades }: DashboardTodayTradesProps) {
  return (
    <HudPanel>
      <div className="flex items-center justify-between border-b border-cyan-400/10 px-5 py-4">
        <div>
          <p className="text-sm font-semibold">Today&apos;s trades</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Closed today · selected account</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-cyan-300">
          <Link href="/trades">
            View all
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
      <div className="divide-y divide-cyan-400/10">
        {loading
          ? Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="p-4">
                <Skeleton className="h-5 w-full" />
              </div>
            ))
          : trades.map((trade) => (
              <div key={trade.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{trade.instrument}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "px-1.5 py-0 text-[9px]",
                        trade.trade_type === "Buy"
                          ? "border-cyan-400/30 text-cyan-300"
                          : "border-rose-400/30 text-rose-300",
                      )}
                    >
                      {trade.trade_type === "Buy" ? "Long" : "Short"}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {trade.exit_date ? formatEntryTime(trade.exit_date) : "Closed"} ·{" "}
                    {formatTradeSignal(trade.signal)}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    (trade.net_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {(trade.net_pnl ?? 0) > 0 ? "+" : ""}
                  {money.format(trade.net_pnl ?? 0)}
                </p>
              </div>
            ))}

        {!loading && trades.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm font-medium">No closed trades today</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Trades that close today will appear here with P&amp;L.
            </p>
          </div>
        ) : null}
      </div>
    </HudPanel>
  )
}

type DashboardOpenTradesProps = {
  loading: boolean
  trades: DashboardTrade[]
  accountName?: string
}

export function DashboardOpenTrades({ loading, trades, accountName }: DashboardOpenTradesProps) {
  return (
    <HudPanel>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/10 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Radio className="h-4 w-4 text-amber-400" />
            Active open trades
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {accountName ? `${accountName} · ` : ""}
            Every open symbol on this account — entry, SL, TP
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-cyan-300">
          <Link href="/live-sync">
            Live sync
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-cyan-400/10 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Symbol
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Side
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Entry
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                SL
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                TP
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Exit
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                Signal
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow key={index} className="border-cyan-400/10">
                    <TableCell colSpan={7}>
                      <Skeleton className="h-10 w-full" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {!loading && trades.length === 0 ? (
              <TableRow className="border-cyan-400/10 hover:bg-transparent">
                <TableCell colSpan={7} className="py-10 text-center">
                  <p className="text-sm font-medium text-muted-foreground">No open trades</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Open positions from any symbol will show here for the selected account.
                  </p>
                </TableCell>
              </TableRow>
            ) : null}

            {!loading
              ? trades.map((trade) => (
                  <TableRow key={trade.id} className="border-cyan-400/10 hover:bg-cyan-400/5">
                    <TableCell className="font-medium">{trade.instrument}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "px-1.5 py-0 text-[10px]",
                          trade.trade_type === "Buy"
                            ? "border-cyan-400/30 text-cyan-300"
                            : "border-rose-400/30 text-rose-300",
                        )}
                      >
                        {trade.trade_type === "Buy" ? "Long" : "Short"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatEntryTime(trade.entry_date)}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {formatLevel(trade.entry_price, trade.instrument)}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums text-rose-300">
                      {formatLevel(trade.stop_loss, trade.instrument)}
                    </TableCell>
                    <TableCell className="tabular-nums text-emerald-300">
                      {formatLevel(trade.target, trade.instrument)}
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-amber-400">Open</span>
                      {trade.exit_price != null ? (
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {formatLevel(trade.exit_price, trade.instrument)}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-xs text-muted-foreground">
                      {formatTradeSignal(trade.signal)}
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>
    </HudPanel>
  )
}
