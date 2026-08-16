"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
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
import { formatTradeSignal } from "@/lib/trading/trade-display"
import { cn } from "@/lib/utils"
type SyncTrade = {
  id: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_date: string
  exit_date?: string | null
  entry_price: number
  exit_price?: number
  quantity: number
  net_pnl?: number
  return_pct?: number
  commission?: number
  signal?: string
  strategy?: string
  external_id?: string
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
  const { activeAccount, activeAccountId, switchVersion, refresh, revalidateSyncedData } =
    useActiveAccount()
  const seenTradeIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_LIVE_SYNC_POLL_SECONDS)
  const [isRefreshingTv, setIsRefreshingTv] = useState(false)

  const { data: tradesData, isLoading: tradesLoading, mutate } = useSWR<{ trades: SyncTrade[] }>(
    activeAccountId ? ["/api/trades?source=tradingview&limit=5000", activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
  )

  const { data: statusData, error: statusError, mutate: mutateStatus } = useSWR<SyncStatus>(
    "/api/sync/heartbeat",
    fetcher,
    { refreshInterval: 10_000 },
  )

  const refreshSyncedViews = useCallback(() => {
    void mutate()
    void mutateStatus()
  }, [mutate, mutateStatus])

  useEffect(() => {
    const updatePoll = () => setPollSeconds(getLiveSyncPollSeconds())
    updatePoll()
    window.addEventListener("jb-live-sync-settings-changed", updatePoll)
    return () => window.removeEventListener("jb-live-sync-settings-changed", updatePoll)
  }, [])

  const trades = tradesData?.trades ?? []

  const { lastError: syncError } = useLiveSyncAutoRefresh({
    enabled: Boolean(activeAccountId),
    pollSeconds,
    onComplete: (result) => {
      const imported = result?.imported || 0
      const updated = result?.updated || 0
      const closedStale = result?.closedStale || 0
      // Always hard-revalidate after a sync pass so exits show even if SSE missed.
      if (imported > 0 || updated > 0 || closedStale > 0) {
        void revalidateSyncedData()
      } else {
        refreshSyncedViews()
      }

      // Soft "waiting for List of trades" is not a hard failure — don't toast every poll.
      if (result?.error && !/list of trades|waiting for list/i.test(String(result.error))) {
        toast({
          title: "Sync issue",
          description: String(result.error),
          variant: "destructive",
        })
      } else if (imported > 0) {
        toast({
          title: "New trade synced",
          description: `${imported} trade(s) imported from TradingView`,
        })
      } else if (updated > 0 || closedStale > 0) {
        toast({
          title: "Trade updated",
          description: "Exit/close synced from TradingView",
        })
      }
    },
  })

  useEffect(() => {
    seenTradeIds.current = new Set()
    initialized.current = false
  }, [activeAccountId])

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
      void revalidateSyncedData()
      void refresh()
    },
    [refresh, revalidateSyncedData],
  )

  useTradeSyncEvent(onTradeSync)

  useEffect(() => {
    if (!trades.length) return

    const currentIds = new Set(trades.map((trade) => trade.id))

    if (!initialized.current) {
      seenTradeIds.current = currentIds
      initialized.current = true
      return
    }

    const newTrades = trades.filter((trade) => !seenTradeIds.current.has(trade.id))
    if (newTrades.length > 0) {
      const latest = newTrades[0]
      toast({
        title: "New trade synced",
        description: `${latest.instrument} ${latest.trade_type === "Buy" ? "Long" : "Short"} · ${
          typeof latest.net_pnl === "number" ? currency.format(latest.net_pnl) : "Open"
        }`,
      })
    }

    seenTradeIds.current = currentIds
  }, [trades, toast])

  const stats = useMemo(() => {
    const closed = trades.filter((trade) => typeof trade.net_pnl === "number")
    const wins = closed.filter((trade) => (trade.net_pnl ?? 0) > 0)
    const losses = closed.filter((trade) => (trade.net_pnl ?? 0) < 0)
    const todayTrades = trades.filter((trade) => {
      try {
        return isToday(parseISO(trade.entry_date))
      } catch {
        return false
      }
    })
    const todayPnl = todayTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
    const totalPnl = closed.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
    const lastTrade = trades[0]
    const recentClosed = [...closed].slice(0, 18).reverse()
    let run = 0
    const pnlSpark = recentClosed.map((trade) => (run += trade.net_pnl ?? 0))
    const dayCounts: number[] = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date()
      day.setDate(day.getDate() - offset)
      const key = format(day, "yyyy-MM-dd")
      dayCounts.push(trades.filter((trade) => trade.entry_date.slice(0, 10) === key).length)
    }

    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      todayPnl,
      totalPnl,
      bestTrade: wins.length ? Math.max(...wins.map((trade) => trade.net_pnl ?? 0)) : 0,
      worstTrade: losses.length ? Math.min(...losses.map((trade) => trade.net_pnl ?? 0)) : 0,
      lastTradeTime: lastTrade ? format(parseISO(lastTrade.entry_date), "MMM d, HH:mm") : "—",
      pnlSpark,
      dayCounts,
      recent: trades.slice(0, 8),
    }
  }, [trades])

  /** Months that actually have trades — from first data month → current */
  const availableExportMonths = useMemo(() => {
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
  }, [trades])

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

      seenTradeIds.current = new Set()
      initialized.current = false
      await mutate({ trades: [] }, { revalidate: true })

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

          <div className="max-h-[min(50vh,28rem)] overflow-auto [&_[data-slot=table-container]]:overflow-visible">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="border-cyan-400/10 hover:bg-transparent">
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Instrument</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Direction</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Entry</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Exit</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Signal</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">P&amp;L</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Return</TableHead>
                  <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Commission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tradesLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading synced trades...
                    </TableCell>
                  </TableRow>
                )}
                {!tradesLoading && trades.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
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
                      {trade.exit_date && trade.exit_price ? (
                        <>
                          <div className="text-sm">{format(parseISO(trade.exit_date), "MMM d, HH:mm")}</div>
                          <div className="text-xs text-muted-foreground">{currency.format(trade.exit_price)}</div>
                        </>
                      ) : (
                        <span className="text-amber-400">Open</span>
                      )}
                    </TableCell>
                    <TableCell>{formatTradeSignal(trade.signal)}</TableCell>
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
                    typeof trade.net_pnl === "number"
                      ? trade.net_pnl >= 0
                        ? "text-emerald-400"
                        : "text-rose-400"
                      : "text-amber-400",
                  )}
                >
                  {typeof trade.net_pnl === "number"
                    ? `${trade.net_pnl > 0 ? "+" : ""}${currency.format(trade.net_pnl)}`
                    : "Open"}
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
