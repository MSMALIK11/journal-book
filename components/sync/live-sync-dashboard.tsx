"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import useSWRInfinite from "swr/infinite"
import { format, isToday, parseISO } from "date-fns"
import {
  BarChart3,
  ChevronDown,
  Download,
  Loader2,
  Radio,
  RefreshCw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
} from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { MiniBars, Sparkline, WinRateRing } from "@/components/dashboard/sparkline"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { authFetch } from "@/lib/client-auth"
import { formatExtensionSyncSummary, requestTvChartRefresh } from "@/lib/client-extension-sync"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import { useLiveSyncAutoRefresh } from "@/hooks/use-live-sync-auto-refresh"
import { useToast } from "@/hooks/use-toast"
import {
  DEFAULT_LIVE_SYNC_POLL_SECONDS,
  getLiveSyncPollSeconds,
} from "@/lib/live-sync-settings"
import { resolveClosedTradeMetrics } from "@/lib/trading/close-pnl"
import type { TradeListSummary } from "@/lib/trading/trade-list-summary"
import { formatTradeSignal } from "@/lib/trading/trade-display"
import { cn } from "@/lib/utils"

const LIVE_SYNC_PAGE_SIZE = 50
type SyncTrade = {
  id: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_date: string
  exit_date?: string | null
  entry_price: number
  exit_price?: number
  quantity: number
  contract_size?: number
  net_pnl?: number
  return_pct?: number
  commission?: number
  signal?: string
  stop_loss?: number
  target?: number
  strategy?: string
  external_id?: string
  is_open?: boolean
}

function isLiveOpen(trade: SyncTrade) {
  if (trade.is_open === false) return false
  return !trade.exit_date
}

/** Leftover-Open collapse sometimes stored only an exit time. Fill price/P&L from the live keeper. */
function completeClosedDisplay(trade: SyncTrade, trades: SyncTrade[]): SyncTrade {
  if (isLiveOpen(trade)) return trade
  const keeper = trades
    .filter(
      (other) =>
        other.id !== trade.id &&
        other.instrument === trade.instrument &&
        other.trade_type === trade.trade_type &&
        isLiveOpen(other) &&
        new Date(other.entry_date).getTime() >= new Date(trade.entry_date).getTime(),
    )
    .sort((a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())[0]

  const exit_price = trade.exit_price ?? keeper?.entry_price
  if (exit_price == null) return trade

  const metrics = resolveClosedTradeMetrics({
    trade_type: trade.trade_type,
    entry_price: trade.entry_price,
    exit_price,
    quantity: trade.quantity,
    contract_size: trade.contract_size,
    instrument: trade.instrument,
    net_pnl: trade.net_pnl,
    return_pct: trade.return_pct,
  })

  return {
    ...trade,
    exit_price,
    net_pnl: metrics.net_pnl,
    return_pct: metrics.return_pct,
  }
}

type SyncTradesPage = {
  trades: SyncTrade[]
  total: number
  page: number
  limit: number
  totalPages: number
  hasMore: boolean
  summary?: TradeListSummary
}

type SyncStatus = {
  connected: boolean
  last_heartbeat: string | null
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data
}

export function LiveSyncDashboard() {
  const { toast } = useToast()
  const { activeAccount, activeAccountId, refresh, revalidateSyncedData } =
    useActiveAccount()
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_LIVE_SYNC_POLL_SECONDS)
  const [isRefreshingTv, setIsRefreshingTv] = useState(false)

  const getTradesKey = useCallback(
    (pageIndex: number, previousPage: SyncTradesPage | null) => {
      if (!activeAccountId) return null
      if (previousPage && !previousPage.hasMore) return null
      const page = pageIndex + 1
      const summary = page === 1 ? "&summary=1" : ""
      return `/api/trades?source=tradingview&limit=${LIVE_SYNC_PAGE_SIZE}&page=${page}&account=${activeAccountId}${summary}`
    },
    [activeAccountId],
  )
  const {
    data: tradePages,
    isLoading: tradesLoading,
    isValidating: tradesValidating,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<SyncTradesPage>(getTradesKey, fetcher, {
    revalidateFirstPage: true,
    revalidateAll: false,
  })

  const { data: statusData, error: statusError, mutate: mutateStatus } = useSWR<SyncStatus>(
    "/api/sync/heartbeat",
    fetcher,
    { refreshInterval: 10_000 },
  )

  const refreshSyncedViews = useCallback(() => {
    void setSize(1)
    void mutate()
    void mutateStatus()
  }, [mutate, mutateStatus, setSize])

  useEffect(() => {
    const updatePoll = () => setPollSeconds(getLiveSyncPollSeconds())
    updatePoll()
    window.addEventListener("jb-live-sync-settings-changed", updatePoll)
    return () => window.removeEventListener("jb-live-sync-settings-changed", updatePoll)
  }, [])

  const rawTrades = useMemo(() => {
    const seen = new Set<string>()
    const list: SyncTrade[] = []
    for (const page of tradePages ?? []) {
      for (const trade of page.trades ?? []) {
        if (seen.has(trade.id)) continue
        seen.add(trade.id)
        list.push(trade)
      }
    }
    return list
  }, [tradePages])

  const trades = useMemo(
    () => rawTrades.map((trade) => completeClosedDisplay(trade, rawTrades)),
    [rawTrades],
  )

  const hasMoreTrades = Boolean(tradePages?.[tradePages.length - 1]?.hasMore)
  const summary = tradePages?.[0]?.summary
  const feedScrollRef = useRef<HTMLDivElement>(null)
  const feedSentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = feedScrollRef.current
    const target = feedSentinelRef.current
    if (!root || !target) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!hasMoreTrades || tradesValidating) return
        void setSize((current) => current + 1)
      },
      { root, rootMargin: "120px" },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMoreTrades, tradesValidating, setSize, size])

  const onComplete = useCallback((result: import("@/lib/client-extension-sync").ExtensionSyncResult | null) => {
    const imported = result?.imported || 0
    const updated = result?.updated || 0
    const closedStale = result?.closedStale || 0
    if (imported > 0 || updated > 0 || closedStale > 0) {
      void setSize(1)
      void mutate()
      void mutateStatus()
      void revalidateSyncedData()
    }

    if (result?.error && !/list of trades|waiting for list/i.test(String(result.error))) {
      toast({
        title: "Sync issue",
        description: String(result.error),
        variant: "destructive",
      })
    }
  }, [mutate, mutateStatus, revalidateSyncedData, setSize, toast])

  const { lastError: syncError } = useLiveSyncAutoRefresh({
    enabled: Boolean(activeAccountId),
    pollSeconds,
    onComplete,
  })

  useEffect(() => {
    let alive = true

    async function probeBridge() {
      if (!alive) return
      if (document.getElementById("jb-extension-bridge")) {
        setBridgeReady(true)
        return
      }

      const responded = await new Promise<boolean>((resolve) => {
        let settled = false
        const timer = window.setTimeout(() => {
          if (settled) return
          settled = true
          document.removeEventListener("jb-bridge-pong", onPong)
          resolve(false)
        }, 500)

        function onPong() {
          if (settled) return
          settled = true
          window.clearTimeout(timer)
          document.removeEventListener("jb-bridge-pong", onPong)
          resolve(true)
        }

        document.addEventListener("jb-bridge-pong", onPong)
        document.dispatchEvent(new CustomEvent("jb-bridge-ping"))
      })

      if (alive && responded) setBridgeReady(true)
    }

    void probeBridge()
    const timer = window.setInterval(() => void probeBridge(), 3000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [])

  const onTradeSync = useCallback(
    (data: { type?: string; imported?: number; updated?: number }) => {
      if (data.type !== "trades_updated") return
      if (!(data.imported || data.updated)) return
      void setSize(1)
      void mutate()
      void mutateStatus()
      void revalidateSyncedData()
      void refresh()
    },
    [mutate, mutateStatus, refresh, revalidateSyncedData, setSize],
  )

  useTradeSyncEvent(onTradeSync)

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => !isLiveOpen(trade))
    const wins = closed.filter((trade) => (trade.net_pnl ?? 0) > 0)
    const losses = closed.filter((trade) => (trade.net_pnl ?? 0) < 0)
    const todayTrades = trades.filter((trade) => {
      try {
        return isToday(parseISO(trade.entry_date))
      } catch {
        return false
      }
    })
    const lastTrade = trades[0]
    const recentClosed = [...closed].slice(0, 18).reverse()
    let run = 0
    const pnlSpark = recentClosed.map((trade) => (run += trade.net_pnl ?? 0))

    return {
      total: summary?.total ?? trades.length,
      wins: summary?.wins ?? wins.length,
      losses: summary?.losses ?? losses.length,
      winRate: summary?.winRate ?? (closed.length ? (wins.length / closed.length) * 100 : 0),
      todayPnl: summary?.todayPnl ?? todayTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0),
      totalPnl: summary?.totalPnl ?? closed.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0),
      bestTrade: summary?.bestTrade ?? (wins.length ? Math.max(...wins.map((trade) => trade.net_pnl ?? 0)) : 0),
      worstTrade: summary?.worstTrade ?? (losses.length ? Math.min(...losses.map((trade) => trade.net_pnl ?? 0)) : 0),
      lastTradeTime: summary?.lastTradeAt
        ? format(parseISO(summary.lastTradeAt), "MMM d, HH:mm")
        : lastTrade
          ? format(parseISO(lastTrade.entry_date), "MMM d, HH:mm")
          : "—",
      pnlSpark,
      dayCounts: summary?.dayCounts ?? [],
      recent: trades.slice(0, 8),
    }
  }, [summary, trades])

  /** Months that actually have trades — from first data month → current */
  const availableExportMonths = useMemo(() => {
    const months = summary?.exportMonths
    if (months?.length) {
      return months.map(({ monthKey, count }) => {
        const [year, month] = monthKey.split("-").map(Number)
        const label = format(new Date(year, month - 1, 1), "MMM yyyy")
        return { monthKey, count, label }
      })
    }

    const counts = new Map<string, number>()
    for (const trade of trades) {
      try {
        const monthKey = format(parseISO(trade.entry_date), "yyyy-MM")
        counts.set(monthKey, (counts.get(monthKey) || 0) + 1)
      } catch {
        // skip bad dates
      }
    }

    return [...counts.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([monthKey, count]) => {
        const [year, month] = monthKey.split("-").map(Number)
        const label = format(new Date(year, month - 1, 1), "MMM yyyy")
        return { monthKey, count, label }
      })
  }, [summary?.exportMonths, trades])

  async function handleSaveToLiveSyncFolder(
    scope: "today" | "month" | "all",
    monthKey?: string,
  ) {
    const symbol =
      activeAccount?.symbols?.[0] ||
      activeAccount?.name ||
      trades[0]?.instrument ||
      "TRADES"

    try {
      const response = await authFetch("/api/export/live-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          symbol,
          accountId: activeAccountId || undefined,
          monthKey: scope === "month" ? monthKey : undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Save failed")

      toast({
        title: `Saved ${data.fileName || "CSV"}`,
        description: data.absolutePath || data.message || "~/TradingJournal/",
      })
    } catch (error) {
      toast({
        title: "Could not save to TradingJournal folder",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  async function handleRefreshTv() {
    if (isRefreshingTv) return
    setIsRefreshingTv(true)
    try {
      const result = await requestTvChartRefresh({
        queueRefresh: async () => {
          const response = await authFetch("/api/sync/request-refresh", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reloadChart: true }),
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || "Could not queue TradingView refresh")
          return new Date(data.at || Date.now()).getTime()
        },
        fetchRefreshStatus: async () => {
          const response = await authFetch("/api/sync/refresh-status")
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || "Could not read sync status")
          return data
        },
      })

      void revalidateSyncedData()
      refreshSyncedViews()

      if (result?.error) {
        toast({
          title: "TradingView refresh failed",
          description: String(result.error),
          variant: "destructive",
        })
      } else {
        toast({
          title: "TradingView refreshed",
          description: formatExtensionSyncSummary(result),
        })
      }
    } catch (error) {
      toast({
        title: "Could not refresh TradingView",
        description:
          error instanceof Error
            ? error.message
            : "Keep the extension and TradingView chart tab open",
        variant: "destructive",
      })
    } finally {
      setIsRefreshingTv(false)
    }
  }

  async function handleClearAll() {
    setClearing(true)
    try {
      const response = await authFetch("/api/trades?source=tradingview", { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete trades")

      await setSize(1)
      await mutate(undefined, { revalidate: true })

      toast({
        title: "Synced trades cleared",
        description: `Removed ${data.deleted ?? 0} TradingView trade(s).`,
      })
      setClearOpen(false)
    } catch (error) {
      toast({
        title: "Could not clear trades",
        description: error instanceof Error ? error.message : "Something went wrong",
        variant: "destructive",
      })
    } finally {
      setClearing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <HudPanel glow={statusData?.connected ? "green" : "none"} className="p-5">
          <p className="hud-label">Extension Status</p>
          <p
            className={cn(
              "mt-2 flex items-center gap-2 text-lg font-semibold",
              statusData?.connected ? "text-emerald-400" : "text-muted-foreground",
            )}
          >
            {statusData?.connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {statusData?.connected ? "Extension connected" : "Extension offline"}
          </p>
          {statusError ? (
            <p className="mt-2 text-xs text-rose-400">
              {statusError instanceof Error ? statusError.message : "Unable to read extension status"}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Heartbeat:{" "}
            {statusData?.last_heartbeat ? format(parseISO(statusData.last_heartbeat), "HH:mm:ss") : "Never"}
          </p>
          <p className="text-xs text-muted-foreground">
            Bridge:{" "}
            <span className={bridgeReady || statusData?.connected ? "text-emerald-400" : "text-amber-400"}>
              {bridgeReady
                ? "Active"
                : statusData?.connected
                  ? "Active (background sync)"
                  : "Not detected — reload extension"}
            </span>
          </p>
          {syncError &&
          !/list of trades|waiting for list|overview|ka-table|0 rows/i.test(syncError) ? (
            <p className="mt-2 text-xs text-rose-400">Last sync error: {syncError}</p>
          ) : null}
        </HudPanel>

        <HudPanel className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="hud-label">Synced Trades</p>
              <p className="mt-2 text-3xl font-semibold text-cyan-100">{stats.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">From Strategy Tester</p>
            </div>
            <MiniBars values={stats.dayCounts} />
          </div>
        </HudPanel>

        <HudPanel glow={stats.todayPnl >= 0 ? "green" : "red"} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="hud-label">Today&apos;s P&amp;L</p>
              <p
                className={cn(
                  "mt-2 text-3xl font-semibold",
                  stats.todayPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {stats.todayPnl >= 0 ? "+" : ""}
                {currency.format(stats.todayPnl)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Closed trades entered today</p>
            </div>
            <Sparkline values={stats.pnlSpark} color={stats.todayPnl >= 0 ? "#34d399" : "#f43f5e"} />
          </div>
        </HudPanel>

        <HudPanel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="hud-label">Win Rate</p>
              <p className="mt-2 text-3xl font-semibold text-cyan-300">{stats.winRate.toFixed(1)}%</p>
              <p className="mt-1 text-xs text-muted-foreground">Last trade: {stats.lastTradeTime}</p>
            </div>
            <WinRateRing value={stats.winRate} />
          </div>
        </HudPanel>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.38fr)]">
        <HudPanel>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-400/10 px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Radio className="h-4 w-4 text-cyan-300" />
              Live trade feed
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 border-cyan-400/40 bg-cyan-400/10 text-cyan-200 hover:bg-cyan-400/20 hover:text-cyan-100"
                disabled={isRefreshingTv}
                title="Reload TradingView chart (same as F5) and sync trades"
                onClick={() => void handleRefreshTv()}
              >
                {isRefreshingTv ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {isRefreshingTv ? "Refreshing TV…" : "Refresh"}
              </Button>
              {trades.length > 0 && (
                <div className="inline-flex rounded-md shadow-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 rounded-r-none border-r-0 border-cyan-400/20"
                    disabled={tradesLoading}
                    onClick={() => void handleSaveToLiveSyncFolder("today")}
                  >
                    <Download className="h-3 w-3" />
                    Save
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-l-none border-cyan-400/20 px-2"
                        disabled={tradesLoading}
                        aria-label="Export options"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[14rem]">
                      <DropdownMenuItem onClick={() => void handleSaveToLiveSyncFolder("today")}>
                        Today
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => void handleSaveToLiveSyncFolder("all")}>
                        All trades
                      </DropdownMenuItem>
                      {availableExportMonths.length > 0 ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                            Months with data
                          </DropdownMenuLabel>
                          {availableExportMonths.map((month) => (
                            <DropdownMenuItem
                              key={month.monthKey}
                              onClick={() => void handleSaveToLiveSyncFolder("month", month.monthKey)}
                            >
                              <span className="flex w-full items-center justify-between gap-3">
                                <span>{month.label}</span>
                                <span className="text-xs text-muted-foreground">{month.count}</span>
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {trades.length > 0 && (
                <Button asChild variant="outline" size="sm" className="gap-1 border-cyan-400/20">
                  <Link href="/analytics">
                    <BarChart3 className="h-3 w-3" />
                    Analytics
                  </Link>
                </Button>
              )}
              <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 border-rose-400/20 text-rose-400 hover:text-rose-300"
                    disabled={tradesLoading || trades.length === 0}
                  >
                    <Trash2 className="h-3 w-3" />
                    Clear all
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete all synced trades?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove all {stats.total} TradingView synced trade
                      {stats.total === 1 ? "" : "s"} from your journal. Manual trades are not affected.
                      You can re-import from the browser extension anytime.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      disabled={clearing}
                      onClick={(event) => {
                        event.preventDefault()
                        void handleClearAll()
                      }}
                    >
                      {clearing ? "Deleting..." : "Delete all"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <div
            ref={feedScrollRef}
            className="max-h-[min(50vh,28rem)] overflow-auto [&_[data-slot=table-container]]:overflow-visible"
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="border-cyan-400/10 hover:bg-transparent">
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Instrument</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Direction</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Entry</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Exit</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Signal</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">SL</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">TP</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">P&amp;L</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Return</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tradesLoading && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Loading synced trades...
                    </TableCell>
                  </TableRow>
                )}
                {!tradesLoading && trades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      No TradingView trades yet. Install the extension and run an import from Strategy Tester.
                    </TableCell>
                  </TableRow>
                )}
                {trades.map((trade) => (
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
                      <div className="text-sm">{format(parseISO(trade.entry_date), "MMM d, HH:mm")}</div>
                      <div className="text-xs text-muted-foreground">{currency.format(trade.entry_price)}</div>
                    </TableCell>
                    <TableCell>
                      {isLiveOpen(trade) ? (
                        <span className="text-amber-400">Open</span>
                      ) : (
                        <>
                          <div className="text-sm">
                            {trade.exit_date ? format(parseISO(trade.exit_date), "MMM d, HH:mm") : "Closed"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {trade.exit_price != null ? currency.format(trade.exit_price) : "—"}
                          </div>
                        </>
                      )}
                    </TableCell>
                    <TableCell>{formatTradeSignal(trade.signal)}</TableCell>
                    <TableCell className="tabular-nums text-rose-300">
                      {trade.stop_loss != null ? currency.format(trade.stop_loss) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-emerald-300">
                      {trade.target != null ? currency.format(trade.target) : "—"}
                    </TableCell>
                    <TableCell>
                      {typeof trade.net_pnl === "number" ? (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 font-semibold",
                            trade.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                          )}
                        >
                          {trade.net_pnl >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {currency.format(trade.net_pnl)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {typeof trade.return_pct === "number"
                        ? `${trade.return_pct >= 0 ? "+" : ""}${trade.return_pct.toFixed(2)}%`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {typeof trade.commission === "number" ? currency.format(trade.commission) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {trades.length > 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="py-3 text-center text-xs text-muted-foreground">
                      <div ref={feedSentinelRef} />
                      {hasMoreTrades
                        ? tradesValidating
                          ? "Loading more trades..."
                          : "Scroll for more"
                        : `Showing ${trades.length} of ${stats.total}`}
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </HudPanel>

        <HudPanel>
          <div className="border-b border-cyan-400/10 px-5 py-4">
            <p className="text-sm font-semibold">List of trades</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Latest synced positions</p>
          </div>
          <div className="max-h-[min(50vh,28rem)] divide-y divide-cyan-400/10 overflow-y-auto">
            {stats.recent.map((trade) => (
              <div key={trade.id} className="flex items-center justify-between gap-3 px-5 py-3">
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
                    {trade.strategy || "TradingView"} · {format(parseISO(trade.entry_date), "MMM d")}
                  </p>
                </div>
                <p
                  className={cn(
                    "shrink-0 text-sm font-semibold",
                    isLiveOpen(trade)
                      ? "text-amber-400"
                      : typeof trade.net_pnl === "number"
                        ? trade.net_pnl >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                        : "text-muted-foreground",
                  )}
                >
                  {isLiveOpen(trade)
                    ? "Open"
                    : typeof trade.net_pnl === "number"
                      ? `${trade.net_pnl > 0 ? "+" : ""}${currency.format(trade.net_pnl)}`
                      : "Closed"}
                </p>
              </div>
            ))}
            {!tradesLoading && stats.recent.length === 0 ? (
              <p className="px-5 py-8 text-center text-xs text-muted-foreground">No synced trades yet</p>
            ) : null}
          </div>
        </HudPanel>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-cyan-400/20 bg-cyan-400/10 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: "Total Trades", value: String(stats.total) },
          { label: "Winning Trades", value: String(stats.wins) },
          { label: "Losing Trades", value: String(stats.losses) },
          {
            label: "Best Trade",
            value: stats.bestTrade ? `+${currency.format(stats.bestTrade)}` : "—",
            tone: "text-emerald-400",
          },
          {
            label: "Worst Trade",
            value: stats.worstTrade ? currency.format(stats.worstTrade) : "—",
            tone: "text-rose-400",
          },
          {
            label: "Total P&L",
            value: `${stats.totalPnl >= 0 ? "+" : ""}${currency.format(stats.totalPnl)}`,
            tone: stats.totalPnl >= 0 ? "text-emerald-400" : "text-rose-400",
          },
        ].map((item) => (
          <div key={item.label} className="bg-card/90 px-4 py-3">
            <p className="hud-label">{item.label}</p>
            <p className={cn("mt-1 text-sm font-semibold", item.tone)}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
