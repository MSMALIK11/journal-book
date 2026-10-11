"use client"

import Link from "next/link"
import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { PlusCircle } from "lucide-react"
import { CommandCharts } from "@/components/dashboard/command-charts"
import {
  DashboardOpenTrades,
  DashboardTodayStats,
  DashboardTodayTrades,
  useDashboardTradeStats,
  type DashboardTrade,
} from "@/components/dashboard/dashboard-overview"
import { Button } from "@/components/ui/button"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import { computeAnalytics } from "@/lib/trading/analytics"

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Unable to load dashboard")
  return data
}

export default function DashboardPage() {
  const { activeAccountId, switchVersion, activeAccount } = useActiveAccount()
  const tradesUrl = activeAccountId
    ? `/api/trades?limit=1000&account=${encodeURIComponent(activeAccountId)}`
    : null

  const { data: tradesData, error, isLoading, mutate } = useSWR<{ trades: DashboardTrade[] }>(
    tradesUrl ? [tradesUrl, activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
  )

  const onTradeSync = useCallback(
    (data: { type?: string; imported?: number; updated?: number }) => {
      if (data.type !== "trades_updated") return
      if (!(data.imported || data.updated)) return
      void mutate()
    },
    [mutate],
  )
  useTradeSyncEvent(onTradeSync)
  const { data: syncStatus } = useSWR<{ connected: boolean }>(
    "/api/sync/heartbeat",
    fetcher,
    { refreshInterval: 10_000 },
  )

  const trades = tradesData?.trades ?? []
  const stats = useDashboardTradeStats(trades)
  const analytics = useMemo(
    () =>
      computeAnalytics(trades, {
        timezone: "Asia/Karachi",
        initialCapital: activeAccount?.initialCapital,
      }),
    [trades, activeAccount?.initialCapital],
  )

  const chartMeta = useMemo(() => {
    const completed = trades.filter((trade) => typeof trade.net_pnl === "number")
    return {
      absPnls: completed.map((trade) => Math.abs(trade.net_pnl ?? 0)),
      symbol:
        activeAccount?.symbols?.[0]?.replace(/[^A-Za-z0-9]/g, "").toUpperCase() ||
        activeAccount?.name ||
        trades[0]?.instrument ||
        "MARKET",
    }
  }, [activeAccount, trades])

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="hud-label">Live overview</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-cyan-50">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeAccount
              ? `${activeAccount.name} — today stats and all open trades across symbols.`
              : "Select an account to see open trades and today performance."}
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

      <DashboardTodayStats
        loading={isLoading}
        todayPnl={stats.todayPnl}
        todayTrades={stats.todayClosedCount}
        todayWins={stats.todayWins}
        todayLosses={stats.todayLosses}
        openCount={stats.openTrades.length}
      />

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <DashboardOpenTrades
          loading={isLoading}
          trades={stats.openTrades}
          accountName={activeAccount?.name}
        />

        <DashboardTodayTrades loading={isLoading} trades={stats.todayTrades} />
      </section>

      <CommandCharts
        loading={isLoading}
        analytics={analytics}
        symbol={chartMeta.symbol}
        extensionLive={Boolean(syncStatus?.connected)}
        recentAbsPnls={chartMeta.absPnls}
      />
    </div>
  )
}
