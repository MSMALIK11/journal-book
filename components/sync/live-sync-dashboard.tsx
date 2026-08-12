"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { format, isToday, parseISO } from "date-fns"
import {
  BarChart3,
  BellRing,
  ChevronDown,
  Download,
  Loader2,
  Radio,
  Trash2,
  TrendingDown,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent, useTradeSyncConnection } from "@/hooks/use-trade-sync-event"
import { useLiveSyncAutoRefresh } from "@/hooks/use-live-sync-auto-refresh"
import { useToast } from "@/hooks/use-toast"
import {
  DEFAULT_LIVE_SYNC_POLL_SECONDS,
  formatLiveSyncPollLabel,
  getLiveSyncPollSeconds,
} from "@/lib/live-sync-settings"
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

  const sseConnected = useTradeSyncConnection()

  useEffect(() => {
    const updatePoll = () => setPollSeconds(getLiveSyncPollSeconds())
    updatePoll()
    window.addEventListener("jb-live-sync-settings-changed", updatePoll)
    return () => window.removeEventListener("jb-live-sync-settings-changed", updatePoll)
  }, [])

  const trades = tradesData?.trades ?? []

  const { isSyncing, lastError: syncError } = useLiveSyncAutoRefresh({
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
    const todayTrades = trades.filter((trade) => isToday(parseISO(trade.entry_date)))
    const todayPnl = todayTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
    const lastTrade = trades[0]

    return {
      total: trades.length,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      todayPnl,
      lastTradeTime: lastTrade ? format(parseISO(lastTrade.entry_date), "MMM d, HH:mm") : "—",
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {activeAccount ? (
          <p className="text-sm text-muted-foreground">
            Viewing account: <span className="font-medium text-foreground">{activeAccount.name}</span>
          </p>
        ) : (
          <span />
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => window.dispatchEvent(new Event("jb-test-trade-alarm"))}
        >
          <BellRing className="h-3.5 w-3.5" />
          Test alarm
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Extension status</CardDescription>
            <CardTitle className="flex items-center gap-2 text-lg">
              {statusData?.connected ? (
                <>
                  <Wifi className="h-4 w-4 text-emerald-500" />
                  Extension connected
                </>
              ) : (
                <>
                  <WifiOff className="h-4 w-4 text-muted-foreground" />
                  Extension offline
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm text-muted-foreground">
            {statusError ? (
              <p className="text-xs text-rose-500">
                {statusError instanceof Error ? statusError.message : "Unable to read extension status"}
              </p>
            ) : null}
            <p>
              Last heartbeat:{" "}
              {statusData?.last_heartbeat
                ? format(parseISO(statusData.last_heartbeat), "HH:mm:ss")
                : "Never"}
            </p>
            <p>
              Extension bridge:{" "}
              <span
                className={
                  bridgeReady || statusData?.connected ? "text-emerald-600" : "text-amber-600"
                }
              >
                {bridgeReady
                  ? "Active"
                  : statusData?.connected
                    ? "Active (background sync)"
                    : "Not detected — reload extension"}
              </span>
            </p>
            {!statusData?.connected ? (
              <p className="text-xs text-amber-600">
                Offline usually means the extension is asleep. Keep this page or a TradingView chart tab
                open with your sync key configured.
              </p>
            ) : null}
            {syncError &&
            !/list of trades|waiting for list|overview|ka-table|0 rows/i.test(syncError) ? (
              <p className="text-xs text-rose-600 mt-2">Last sync error: {syncError}</p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Synced trades</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            From TradingView Strategy Tester
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Today&apos;s P&amp;L</CardDescription>
            <CardTitle
              className={`text-2xl ${
                stats.todayPnl >= 0 ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {stats.todayPnl >= 0 ? "+" : ""}
              {currency.format(stats.todayPnl)}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Closed trades entered today
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win rate</CardDescription>
            <CardTitle className="text-2xl">{stats.winRate.toFixed(1)}%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Last trade: {stats.lastTradeTime}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4" />
                Live trade feed
              </CardTitle>
            </div>
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <Badge variant="outline" className="gap-1 text-amber-600">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Syncing
                </Badge>
              ) : null}
              {pollSeconds > 0 ? (
                <Badge variant="outline" className="gap-1 text-primary">
                  <Radio className="h-3 w-3" />
                  {formatLiveSyncPollLabel(pollSeconds)}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Auto-sync off
                </Badge>
              )}
              <Badge
                variant="outline"
                className={`gap-1 ${sseConnected ? "text-emerald-600" : "text-muted-foreground"}`}
              >
                <Zap className="h-3 w-3" />
                {sseConnected ? "Live" : "Connecting…"}
              </Badge>
              {trades.length > 0 && (
                <div className="inline-flex rounded-md shadow-sm">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 rounded-r-none border-r-0"
                    disabled={tradesLoading}
                    onClick={() => void handleSaveToLiveSyncFolder("today")}
                  >
                    <Download className="h-3 w-3" />
                    Save to TradingJournal
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-l-none px-2"
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
                          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                            Months with data
                          </DropdownMenuLabel>
                          {availableExportMonths.map((month) => (
                            <DropdownMenuItem
                              key={month.monthKey}
                              onClick={() =>
                                void handleSaveToLiveSyncFolder("month", month.monthKey)
                              }
                            >
                              <span className="flex w-full items-center justify-between gap-3">
                                <span>{month.label}</span>
                                <span className="text-xs text-muted-foreground">
                                  {month.count}
                                </span>
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
                <Button asChild variant="secondary" size="sm" className="gap-1">
                  <Link href="/analytics">
                    <BarChart3 className="h-3 w-3" />
                    View analytics
                  </Link>
                </Button>
              )}
              <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1 text-destructive hover:text-destructive"
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
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instrument</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead>Signal</TableHead>
                <TableHead>P&amp;L</TableHead>
                <TableHead>Return</TableHead>
                <TableHead>Commission</TableHead>
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
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.instrument}</TableCell>
                  <TableCell>
                    <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
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
                      "Open"
                    )}
                  </TableCell>
                  <TableCell>{trade.signal || "—"}</TableCell>
                  <TableCell>
                    {typeof trade.net_pnl === "number" ? (
                      <span
                        className={`inline-flex items-center gap-1 ${
                          trade.net_pnl >= 0 ? "text-emerald-500" : "text-rose-500"
                        }`}
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
        </CardContent>
      </Card>
    </div>
  )
}
