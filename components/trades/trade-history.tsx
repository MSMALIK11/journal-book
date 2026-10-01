"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { format, subDays } from "date-fns"
import useSWRInfinite from "swr/infinite"
import { Loader2, Search, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import {
  formatTradeEntryDateTime,
  resolveTradeLegs,
  tradeSideLabel,
} from "@/lib/trading/trade-display"
import type { TradeListSummary } from "@/lib/trading/trade-list-summary"
import { cn } from "@/lib/utils"

type Trade = {
  id: string
  entry_date: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_price: number
  exit_price?: number | null
  quantity: number
  quantity_mode?: "lots" | "units"
  net_pnl?: number | null
  strategy?: string
  emotion_tag?: string
}

type TradesPage = {
  trades: Trade[]
  total: number
  hasMore: boolean
  summary?: TradeListSummary
}

type ResultFilter = "all" | "profit" | "loss" | "open"

const TRADES_PAGE_SIZE = 30

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
})

const tradesFetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Unable to load trade history")
  return data as TradesPage
}

function buildTradesQuery(options: {
  page: number
  searchTerm: string
  filterType: ResultFilter
  filterDirection: string
  filterStrategy: string
  periodFilter: string
  includeSummary: boolean
}) {
  const params = new URLSearchParams()
  params.set("page", String(options.page))
  params.set("limit", String(TRADES_PAGE_SIZE))

  const search = options.searchTerm.trim()
  if (search) params.set("search", search)
  if (options.filterType !== "all") params.set("type", options.filterType)
  if (options.filterDirection !== "all") params.set("direction", options.filterDirection)
  if (options.filterStrategy !== "all") params.set("strategy", options.filterStrategy)
  if (options.periodFilter === "7d") {
    params.set("startDate", format(subDays(new Date(), 7), "yyyy-MM-dd"))
  }
  if (options.periodFilter === "30d") {
    params.set("startDate", format(subDays(new Date(), 30), "yyyy-MM-dd"))
  }
  if (options.includeSummary) params.set("summary", "1")

  return `/api/trades?${params.toString()}`
}

function computeMetricsFromTrades(trades: Trade[]) {
  const closed = trades.filter((t) => typeof t.net_pnl === "number")
  const wins = closed.filter((t) => (t.net_pnl ?? 0) > 0)
  const netPnl = closed.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0)

  return {
    total: trades.length,
    closed: closed.length,
    netPnl,
    winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
    wins: wins.length,
    losses: closed.length - wins.length,
  }
}

export function TradeHistory() {
  const { toast } = useToast()
  const { activeAccountId, switchVersion } = useActiveAccount()
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<ResultFilter>("all")
  const [filterDirection, setFilterDirection] = useState("all")
  const [filterStrategy, setFilterStrategy] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const tableScrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)

  const filterSignature = useMemo(
    () =>
      JSON.stringify({
        searchTerm,
        filterType,
        filterDirection,
        filterStrategy,
        periodFilter,
        activeAccountId,
        switchVersion,
      }),
    [searchTerm, filterType, filterDirection, filterStrategy, periodFilter, activeAccountId, switchVersion],
  )

  const getTradesKey = useCallback(
    (pageIndex: number, previousPage: TradesPage | null) => {
      if (!activeAccountId) return null
      if (previousPage && !previousPage.hasMore) return null
      return buildTradesQuery({
        page: pageIndex + 1,
        searchTerm,
        filterType,
        filterDirection,
        filterStrategy,
        periodFilter,
        includeSummary: pageIndex === 0,
      })
    },
    [activeAccountId, searchTerm, filterType, filterDirection, filterStrategy, periodFilter],
  )

  const {
    data: tradePages,
    error,
    isLoading,
    isValidating,
    mutate,
    size,
    setSize,
  } = useSWRInfinite<TradesPage>(getTradesKey, tradesFetcher, {
    revalidateFirstPage: true,
    revalidateAll: false,
  })

  useEffect(() => {
    void setSize(1)
  }, [filterSignature, setSize])

  const trades = useMemo(() => {
    const seen = new Set<string>()
    const list: Trade[] = []
    for (const page of tradePages ?? []) {
      for (const trade of page.trades ?? []) {
        if (seen.has(trade.id)) continue
        seen.add(trade.id)
        list.push(trade)
      }
    }
    return list
  }, [tradePages])

  const summary = tradePages?.[0]?.summary
  const totalCount = tradePages?.[0]?.total ?? trades.length
  const hasMore = Boolean(tradePages?.[tradePages.length - 1]?.hasMore)

  const metrics = useMemo(() => {
    if (summary) {
      return {
        total: summary.total,
        closed: summary.closed,
        netPnl: summary.totalPnl,
        winRate: summary.winRate,
        wins: summary.wins,
        losses: summary.losses,
      }
    }
    return computeMetricsFromTrades(trades)
  }, [summary, trades])

  useEffect(() => {
    const root = tableScrollRef.current
    const target = sentinelRef.current
    if (!root || !target) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (!hasMore || isValidating) return
        void setSize((current) => current + 1)
      },
      { root, rootMargin: "120px" },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [hasMore, isValidating, setSize, size, trades.length])

  const deleteTrade = async (tradeId: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return
    setDeletingId(tradeId)

    try {
      const response = await authFetch(`/api/trades/${tradeId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to delete trade")

      await mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            trades: page.trades.filter((trade) => trade.id !== tradeId),
            total: Math.max(0, page.total - 1),
          })),
        { revalidate: true },
      )

      toast({
        title: "Trade deleted",
        description: "The trade was permanently removed from your journal.",
      })
    } catch (deleteError) {
      toast({
        title: "Could not delete trade",
        description:
          deleteError instanceof Error ? deleteError.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const strategies = Array.from(
    new Set(trades.map((trade) => trade.strategy).filter((strategy): strategy is string => Boolean(strategy))),
  )

  const summaryCards = [
    { label: "Trades", value: metrics.total.toString() },
    { label: "Closed", value: metrics.closed.toString() },
    {
      label: "Net P&L",
      value: currency.format(metrics.netPnl),
      tone: metrics.netPnl >= 0 ? "positive" : "negative",
    },
    { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%` },
    { label: "W / L", value: `${metrics.wins} / ${metrics.losses}` },
  ]

  const loading = isLoading && !tradePages
  const errorMessage = error instanceof Error ? error.message : error ? "Unable to load trade history" : ""

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {summaryCards.map((card) => (
          <HudPanel
            key={card.label}
            glow={card.tone === "positive" ? "green" : card.tone === "negative" ? "red" : "cyan"}
            className="p-4"
          >
            <p className="hud-label">{card.label}</p>
            <p
              className={cn(
                "mt-1.5 text-lg font-semibold tabular-nums",
                card.tone === "positive" && "text-emerald-400",
                card.tone === "negative" && "text-rose-400",
                !card.tone && "text-cyan-100",
              )}
            >
              {loading ? "—" : card.value}
            </p>
          </HudPanel>
        ))}
      </div>

      <HudPanel>
        <HudPanelHeader title="Search & filters" action={<Search className="h-4 w-4 text-cyan-300" />} />
        <div className="p-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search symbol or strategy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border-cyan-400/20 bg-transparent"
              />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full border-cyan-400/20 bg-transparent md:w-36">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDirection} onValueChange={setFilterDirection}>
              <SelectTrigger className="w-full border-cyan-400/20 bg-transparent md:w-32">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="Buy">Long</SelectItem>
                <SelectItem value="Sell">Short</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as ResultFilter)}>
              <SelectTrigger className="w-full border-cyan-400/20 bg-transparent md:w-32">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="profit">Profitable</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStrategy} onValueChange={setFilterStrategy}>
              <SelectTrigger className="w-full border-cyan-400/20 bg-transparent md:w-40">
                <SelectValue placeholder="Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All strategies</SelectItem>
                {strategies.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {strategy}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader
          title="Trades"
          action={
            !loading ? (
              <span className="text-sm font-normal text-muted-foreground">({totalCount})</span>
            ) : null
          }
        />
        <div
          ref={tableScrollRef}
          className="max-h-[min(60vh,38rem)] overflow-auto px-4 pb-4 [&_[data-slot=table-container]]:overflow-visible"
        >
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="border-cyan-400/10 hover:bg-transparent">
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Date</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Symbol</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Side</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Entry</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Exit</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Size</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">P&L</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Strategy</TableHead>
                <TableHead className="bg-card text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Emotion</TableHead>
                <TableHead className="w-12 bg-card" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                    <p className="mt-2 text-sm text-muted-foreground">Loading your trades...</p>
                  </TableCell>
                </TableRow>
              ) : trades.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                    {totalCount === 0 ? "No trades recorded yet." : "No trades match these filters."}
                  </TableCell>
                </TableRow>
              ) : (
                trades.map((trade) => {
                  const legs = resolveTradeLegs(trade)
                  return (
                    <TableRow key={trade.id} className="border-cyan-400/10 hover:bg-cyan-400/5">
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatTradeEntryDateTime(trade.entry_date)}
                      </TableCell>
                      <TableCell className="font-medium">{trade.instrument}</TableCell>
                      <TableCell>
                        <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                          {tradeSideLabel(trade.trade_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="tabular-nums">{currency.format(legs.entryPrice)}</TableCell>
                      <TableCell className="tabular-nums">
                        {legs.exitPrice != null ? currency.format(legs.exitPrice) : "—"}
                      </TableCell>
                      <TableCell>
                        {trade.quantity} {trade.quantity_mode === "lots" ? "lots" : "units"}
                      </TableCell>
                      <TableCell>
                        {typeof trade.net_pnl === "number" ? (
                          <span className={trade.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                            {currency.format(trade.net_pnl)}
                          </span>
                        ) : (
                          <Badge variant="outline">Open</Badge>
                        )}
                      </TableCell>
                      <TableCell>{trade.strategy && <Badge variant="outline">{trade.strategy}</Badge>}</TableCell>
                      <TableCell>{trade.emotion_tag && <Badge variant="outline">{trade.emotion_tag}</Badge>}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteTrade(trade.id)}
                          disabled={deletingId === trade.id}
                          aria-label={`Delete ${trade.instrument} trade`}
                        >
                          {deletingId === trade.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
              {trades.length > 0 && (
                <TableRow className="border-cyan-400/10 hover:bg-transparent">
                  <TableCell colSpan={10} className="py-3 text-center text-xs text-muted-foreground">
                    <div ref={sentinelRef} className="h-1" />
                    {hasMore ? (
                      isValidating ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Loading more trades...
                        </span>
                      ) : (
                        "Scroll for more"
                      )
                    ) : (
                      `Showing all ${trades.length} trade${trades.length === 1 ? "" : "s"}`
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </HudPanel>
    </div>
  )
}
