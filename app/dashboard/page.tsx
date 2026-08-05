"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { format, parseISO } from "date-fns"
import {
  ArrowRight,
  Crosshair,
  PlusCircle,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { DashboardCalendar } from "@/components/calendar/dashboard-calendar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { cn } from "@/lib/utils"

type Trade = {
  id: string
  entry_date: string
  instrument: string
  trade_type: "Buy" | "Sell"
  quantity: number
  net_pnl?: number | null
  strategy?: string
  stop_loss?: number
  target?: number
  entry_price: number
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export default function DashboardPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const { activeAccountId, switchVersion, activeAccount } = useActiveAccount()

  useEffect(() => {
    if (!activeAccountId) return

    async function loadTrades() {
      setLoading(true)
      try {
        const response = await authFetch("/api/trades?limit=100")
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load dashboard")
        setTrades(data.trades || [])
        setError("")
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "Unable to load dashboard")
      } finally {
        setLoading(false)
      }
    }

    loadTrades()
  }, [activeAccountId, switchVersion])

  const performance = useMemo(() => {
    const completed = trades.filter((trade) => typeof trade.net_pnl === "number")
    const wins = completed.filter((trade) => (trade.net_pnl ?? 0) > 0)
    const losses = completed.filter((trade) => (trade.net_pnl ?? 0) < 0)
    const totalPnl = completed.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
    const winRate = completed.length ? (wins.length / completed.length) * 100 : 0

    const rrValues = completed
      .map((trade) => {
        if (!trade.stop_loss || !trade.target) return null
        const risk = Math.abs(trade.entry_price - trade.stop_loss)
        const reward = Math.abs(trade.target - trade.entry_price)
        return risk > 0 ? reward / risk : null
      })
      .filter((value): value is number => value !== null)

    const averageRR = rrValues.length
      ? rrValues.reduce((total, value) => total + value, 0) / rrValues.length
      : 0

    const setupMap = completed.reduce<
      Record<string, { trades: number; wins: number; pnl: number; rrTotal: number; rrCount: number }>
    >((result, trade) => {
      const setup = trade.strategy || "Uncategorized"
      result[setup] ??= { trades: 0, wins: 0, pnl: 0, rrTotal: 0, rrCount: 0 }
      result[setup].trades += 1
      result[setup].pnl += trade.net_pnl ?? 0
      if ((trade.net_pnl ?? 0) > 0) result[setup].wins += 1

      if (trade.stop_loss && trade.target) {
        const risk = Math.abs(trade.entry_price - trade.stop_loss)
        const reward = Math.abs(trade.target - trade.entry_price)
        if (risk > 0) {
          result[setup].rrTotal += reward / risk
          result[setup].rrCount += 1
        }
      }
      return result
    }, {})

    const setups = Object.entries(setupMap)
      .map(([name, result]) => ({
        name,
        trades: result.trades,
        winRate: result.trades ? (result.wins / result.trades) * 100 : 0,
        averageRR: result.rrCount ? result.rrTotal / result.rrCount : 0,
        pnl: result.pnl,
      }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 5)

    return {
      completed,
      totalPnl,
      winRate,
      averageRR,
      worstTrade: losses.length ? Math.min(...losses.map((trade) => trade.net_pnl ?? 0)) : 0,
      setups,
      recentTrades: completed.slice(0, 5),
    }
  }, [trades])

  const metrics = [
    {
      label: "Net P&L",
      value: currency.format(performance.totalPnl),
      detail: `${performance.completed.length} closed trades`,
      icon: performance.totalPnl >= 0 ? TrendingUp : TrendingDown,
      tone: performance.totalPnl >= 0 ? "text-emerald-500" : "text-rose-500",
      surface: performance.totalPnl >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
    },
    {
      label: "Win rate",
      value: `${performance.winRate.toFixed(1)}%`,
      detail: "Across closed trades",
      icon: Crosshair,
      tone: "text-sky-500",
      surface: "bg-sky-500/10",
    },
    {
      label: "Average R:R",
      value: performance.averageRR ? `1 : ${performance.averageRR.toFixed(2)}` : "—",
      detail: "From stop and target data",
      icon: ShieldCheck,
      tone: "text-violet-500",
      surface: "bg-violet-500/10",
    },
    {
      label: "Worst trade",
      value: currency.format(performance.worstTrade),
      detail: "Largest recorded loss",
      icon: TrendingDown,
      tone: "text-rose-500",
      surface: "bg-rose-500/10",
    },
  ]

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5">
      <header className="flex flex-col gap-5 rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge className="mb-3 bg-primary/10 text-primary hover:bg-primary/10">Performance overview</Badge>
          <h1 className="text-3xl font-semibold tracking-tight">Trading dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review performance, spot patterns, and decide your next action.
            {activeAccount ? ` Viewing ${activeAccount.name}.` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild>
            <Link href="/trades/new">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add trade
            </Link>
          </Button>
        </div>
      </header>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}. Refresh the page to try again.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon
          return (
            <Card key={metric.label} className="rounded-2xl border-border/60 shadow-sm">
              <CardContent className="flex items-start justify-between p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                    {metric.label}
                  </p>
                  {loading ? (
                    <Skeleton className="mt-3 h-8 w-24" />
                  ) : (
                    <p className={cn("mt-2 text-2xl font-semibold tracking-tight", metric.tone)}>
                      {metric.value}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p>
                </div>
                <div className={cn("rounded-xl p-2.5", metric.surface, metric.tone)}>
                  <Icon className="h-4 w-4" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <DashboardCalendar trades={trades} />

        <Card className="rounded-2xl border-border/60 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60">
            <div>
              <CardTitle className="text-base">Recent trades</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest closed positions</p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/trades">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="divide-y divide-border/60 p-0">
            {loading &&
              Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="p-4">
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}

            {!loading &&
              performance.recentTrades.map((trade) => (
                <div key={trade.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold">{trade.instrument}</p>
                      <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                        {trade.trade_type === "Buy" ? "Long" : "Short"}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {trade.strategy || "No setup"} · {format(parseISO(trade.entry_date), "MMM d")}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 text-sm font-semibold",
                      (trade.net_pnl ?? 0) >= 0 ? "text-emerald-500" : "text-rose-500",
                    )}
                  >
                    {(trade.net_pnl ?? 0) > 0 ? "+" : ""}
                    {currency.format(trade.net_pnl ?? 0)}
                  </p>
                </div>
              ))}

            {!loading && performance.recentTrades.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-sm font-medium">No closed trades yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Your latest journal entries will appear here.</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/trades/new">Add first trade</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60">
          <div>
            <CardTitle className="text-base">Performance by setup</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Your most profitable repeatable patterns</p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/analytics">
              Analytics
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-5">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : performance.setups.length > 0 ? (
            <div className="overflow-x-auto">
              <div className="min-w-[680px]">
                <div className="grid grid-cols-[minmax(200px,1.5fr)_0.6fr_0.7fr_0.7fr] border-b border-border/60 bg-muted/20 px-5 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span>Setup</span>
                  <span>Trades</span>
                  <span>Win rate</span>
                  <span className="text-right">P&amp;L</span>
                </div>
                {performance.setups.map((setup) => (
                  <div
                    key={setup.name}
                    className="grid grid-cols-[minmax(200px,1.5fr)_0.6fr_0.7fr_0.7fr] items-center border-b border-border/50 px-5 py-4 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium">{setup.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {setup.averageRR ? `Avg 1 : ${setup.averageRR.toFixed(2)} R:R` : "R:R not recorded"}
                      </p>
                    </div>
                    <p className="text-sm">{setup.trades}</p>
                    <p className="text-sm">{setup.winRate.toFixed(0)}%</p>
                    <p className={cn("text-right text-sm font-semibold", setup.pnl >= 0 ? "text-emerald-500" : "text-rose-500")}>
                      {setup.pnl > 0 ? "+" : ""}
                      {currency.format(setup.pnl)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Add a strategy to your trades to unlock setup-level performance.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
