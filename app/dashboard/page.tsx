"use client"

import Link from "next/link"
import { useMemo } from "react"
import { format, parseISO } from "date-fns"
import useSWR from "swr"
import { ArrowRight, PlusCircle } from "lucide-react"
import { DashboardCalendar } from "@/components/calendar/dashboard-calendar"
import { CommandCharts } from "@/components/dashboard/command-charts"
import { CommandKpis } from "@/components/dashboard/command-kpis"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { computeAnalytics } from "@/lib/trading/analytics"
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
  return_pct?: number | null
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Unable to load dashboard")
  return data
}

export default function DashboardPage() {
  const { activeAccountId, switchVersion, activeAccount } = useActiveAccount()
  const { data: tradesData, error, isLoading } = useSWR<{ trades: Trade[] }>(
    activeAccountId ? ["/api/trades?limit=1000", activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
  )
  const { data: syncStatus } = useSWR<{ connected: boolean }>(
    "/api/sync/heartbeat",
    fetcher,
    { refreshInterval: 10_000 },
  )

  const trades = tradesData?.trades ?? []
  const analytics = useMemo(() => computeAnalytics(trades, { timezone: "Asia/Karachi" }), [trades])

  const performance = useMemo(() => {
    const completed = trades.filter((trade) => typeof trade.net_pnl === "number")
    const losses = completed.filter((trade) => (trade.net_pnl ?? 0) < 0)
    const rrValues = completed
      .map((trade) => {
        if (!trade.stop_loss || !trade.target) return null
        const risk = Math.abs(trade.entry_price - trade.stop_loss)
        const reward = Math.abs(trade.target - trade.entry_price)
        return risk > 0 ? reward / risk : null
      })
      .filter((value): value is number => value !== null)

    return {
      completed,
      totalPnl: analytics.overview.netPnl,
      winRate: analytics.overview.winRate,
      averageRR: rrValues.length ? rrValues.reduce((total, value) => total + value, 0) / rrValues.length : 0,
      worstTrade: losses.length ? Math.min(...losses.map((trade) => trade.net_pnl ?? 0)) : 0,
      recentTrades: completed.slice(0, 7),
      equitySpark: analytics.equityCurve.slice(-18).map((point) => point.equity),
      lossSpark: losses.slice(0, 12).map((trade) => trade.net_pnl ?? 0).reverse(),
      absPnls: completed.map((trade) => Math.abs(trade.net_pnl ?? 0)),
    }
  }, [analytics, trades])

  const symbol =
    activeAccount?.symbols?.[0]?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() ||
    activeAccount?.name ||
    trades[0]?.instrument ||
    "MARKET"

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="hud-label">Performance overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cyan-50">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeAccount ? `Viewing ${activeAccount.name}.` : "Review performance and decide the next action."}
          </p>
        </div>
        <Button asChild className="bg-cyan-400 text-cyan-950 hover:bg-cyan-300">
          <Link href="/trades/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add trade
          </Link>
        </Button>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400">
          {error instanceof Error ? error.message : "Unable to load dashboard"}. Refresh the page to try again.
        </div>
      ) : null}

      <CommandKpis
        loading={isLoading}
        netPnl={performance.totalPnl}
        closedCount={performance.completed.length}
        winRate={performance.winRate}
        averageRR={performance.averageRR}
        worstTrade={performance.worstTrade}
        equitySpark={performance.equitySpark}
        lossSpark={performance.lossSpark}
      />

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <DashboardCalendar trades={trades} />

        <HudPanel>
          <div className="flex items-center justify-between border-b border-cyan-400/10 px-5 py-4">
            <div>
              <p className="text-sm font-semibold">Recent trades</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Latest closed positions</p>
            </div>
            <Button asChild variant="ghost" size="sm" className="text-cyan-300">
              <Link href="/trades">
                View all
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="divide-y divide-cyan-400/10">
            {isLoading
              ? Array.from({ length: 5 }).map((_, index) => (
                  <div key={index} className="p-4">
                    <Skeleton className="h-5 w-full" />
                  </div>
                ))
              : performance.recentTrades.map((trade) => (
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
                        {trade.strategy || "No setup"} · {format(parseISO(trade.entry_date), "MMM d")}
                      </p>
                    </div>
                    <p
                      className={cn(
                        "shrink-0 text-sm font-semibold",
                        (trade.net_pnl ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {(trade.net_pnl ?? 0) > 0 ? "+" : ""}
                      {currency.format(trade.net_pnl ?? 0)}
                    </p>
                  </div>
                ))}

            {!isLoading && performance.recentTrades.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm font-medium">No closed trades yet</p>
                <p className="mt-1 text-xs text-muted-foreground">Your latest journal entries will appear here.</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/trades/new">Add first trade</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </HudPanel>
      </section>

      <CommandCharts
        loading={isLoading}
        analytics={analytics}
        symbol={symbol}
        extensionLive={Boolean(syncStatus?.connected)}
        recentAbsPnls={performance.absPnls}
      />
    </div>
  )
}
