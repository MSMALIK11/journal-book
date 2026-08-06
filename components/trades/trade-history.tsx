"use client"

import { useEffect, useMemo, useState } from "react"
import { format, subDays } from "date-fns"
import { Loader2, Search, Trash2 } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { resolveTradeLegs, tradeSideLabel } from "@/lib/trading/trade-display"
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

type ResultFilter = "all" | "profit" | "loss" | "open"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
})

export function TradeHistory() {
  const { toast } = useToast()
  const { activeAccountId, switchVersion } = useActiveAccount()
  const [trades, setTrades] = useState<Trade[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState<ResultFilter>("all")
  const [filterDirection, setFilterDirection] = useState("all")
  const [filterStrategy, setFilterStrategy] = useState("all")
  const [periodFilter, setPeriodFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const tradesPerPage = 15

  useEffect(() => {
    if (!activeAccountId) return
    const controller = new AbortController()

    async function loadTrades() {
      try {
        setLoading(true)
        setError("")
        const response = await authFetch("/api/trades?limit=1000", {
          signal: controller.signal,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load trade history")
        setTrades(data.trades ?? [])
      } catch (requestError) {
        if (controller.signal.aborted) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load trade history",
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadTrades()
    return () => controller.abort()
  }, [activeAccountId, switchVersion])

  const filteredTrades = useMemo(() => {
    const today = format(new Date(), "yyyy-MM-dd")
    let startDate: string | null = null
    if (periodFilter === "7d") startDate = format(subDays(new Date(), 7), "yyyy-MM-dd")
    if (periodFilter === "30d") startDate = format(subDays(new Date(), 30), "yyyy-MM-dd")

    return trades.filter((trade) => {
      const tradeDate = trade.entry_date.slice(0, 10)
      if (startDate && tradeDate < startDate) return false
      if (startDate && tradeDate > today) return false

      if (searchTerm) {
        const query = searchTerm.toLowerCase()
        const matchesSearch =
          trade.instrument.toLowerCase().includes(query) ||
          trade.strategy?.toLowerCase().includes(query)
        if (!matchesSearch) return false
      }

      if (filterDirection !== "all" && trade.trade_type !== filterDirection) return false

      if (filterType === "profit" && !(typeof trade.net_pnl === "number" && trade.net_pnl > 0)) {
        return false
      }
      if (filterType === "loss" && !(typeof trade.net_pnl === "number" && trade.net_pnl < 0)) {
        return false
      }
      if (filterType === "open" && typeof trade.net_pnl === "number") return false

      if (filterStrategy !== "all" && trade.strategy !== filterStrategy) return false

      return true
    })
  }, [trades, searchTerm, filterType, filterDirection, filterStrategy, periodFilter])

  const metrics = useMemo(() => {
    const closed = filteredTrades.filter((t) => typeof t.net_pnl === "number")
    const wins = closed.filter((t) => (t.net_pnl ?? 0) > 0)
    const netPnl = closed.reduce((sum, t) => sum + (t.net_pnl ?? 0), 0)

    return {
      total: filteredTrades.length,
      closed: closed.length,
      netPnl,
      winRate: closed.length ? (wins.length / closed.length) * 100 : 0,
      wins: wins.length,
      losses: closed.length - wins.length,
    }
  }, [filteredTrades])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterType, filterDirection, filterStrategy, periodFilter])

  const deleteTrade = async (tradeId: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return
    setDeletingId(tradeId)

    try {
      const response = await authFetch(`/api/trades/${tradeId}`, {
        method: "DELETE",
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to delete trade")

      setTrades((current) => current.filter((trade) => trade.id !== tradeId))
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

  const paginatedTrades = filteredTrades.slice(
    (currentPage - 1) * tradesPerPage,
    currentPage * tradesPerPage,
  )
  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / tradesPerPage))
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      )}

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {summaryCards.map((card) => (
          <Card key={card.label} className="rounded-xl border-border/60 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p
                className={cn(
                  "mt-1.5 text-lg font-semibold tabular-nums",
                  card.tone === "positive" && "text-emerald-500",
                  card.tone === "negative" && "text-rose-500",
                )}
              >
                {loading ? "—" : card.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            Search & filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search symbol or strategy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-full md:w-36">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterDirection} onValueChange={setFilterDirection}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sides</SelectItem>
                <SelectItem value="Buy">Long</SelectItem>
                <SelectItem value="Sell">Short</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as ResultFilter)}>
              <SelectTrigger className="w-full md:w-32">
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
              <SelectTrigger className="w-full md:w-40">
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
        </CardContent>
      </Card>

      <Card className="rounded-xl border-border/60">
        <CardHeader>
          <CardTitle>
            Trades
            {!loading ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({filteredTrades.length})
              </span>
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Emotion</TableHead>
                  <TableHead className="w-12" />
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
                ) : paginatedTrades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                      {trades.length === 0
                        ? "No trades recorded yet."
                        : "No trades match these filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTrades.map((trade) => {
                    const legs = resolveTradeLegs(trade)
                    return (
                      <TableRow key={trade.id}>
                        <TableCell>
                          {format(new Date(`${trade.entry_date.slice(0, 10)}T00:00:00`), "dd/MM/yyyy")}
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
                            <span className={trade.net_pnl >= 0 ? "text-emerald-500" : "text-rose-500"}>
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
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
