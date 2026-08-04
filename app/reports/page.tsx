"use client"

import { useEffect, useMemo, useState } from "react"
import { format, parseISO, subDays } from "date-fns"
import type { DateRange } from "react-day-picker"
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Loader2,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { cn } from "@/lib/utils"

type Trade = {
  id: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_date: string
  exit_date?: string | null
  entry_price: number
  exit_price?: number | null
  quantity: number
  quantity_mode?: "lots" | "units"
  net_pnl?: number | null
  strategy?: string
}

type ResultFilter = "all" | "profit" | "loss" | "open"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const rowsPerPage = 15

export default function ReportPage() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const [trades, setTrades] = useState<Trade[]>([])
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [directionFilter, setDirectionFilter] = useState("all")
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all")
  const [quickFilter, setQuickFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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
        if (!response.ok) throw new Error(data.error || "Unable to load trading reports")
        setTrades(data.trades ?? [])
      } catch (requestError) {
        if (controller.signal.aborted) return
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load trading reports",
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
    let endDate: string | null = null

    if (quickFilter === "7d") {
      startDate = format(subDays(new Date(), 7), "yyyy-MM-dd")
      endDate = today
    }
    if (quickFilter === "30d") {
      startDate = format(subDays(new Date(), 30), "yyyy-MM-dd")
      endDate = today
    }
    if (quickFilter === "custom") {
      startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null
      endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null
    }

    return trades.filter((trade) => {
      const tradeDate = trade.entry_date.slice(0, 10)
      if (startDate && tradeDate < startDate) return false
      if (endDate && tradeDate > endDate) return false
      if (directionFilter !== "all" && trade.trade_type !== directionFilter) return false

      if (resultFilter === "profit" && !(typeof trade.net_pnl === "number" && trade.net_pnl > 0)) {
        return false
      }
      if (resultFilter === "loss" && !(typeof trade.net_pnl === "number" && trade.net_pnl < 0)) {
        return false
      }
      if (resultFilter === "open" && typeof trade.net_pnl === "number") return false

      return true
    })
  }, [trades, quickFilter, dateRange, directionFilter, resultFilter])

  useEffect(() => {
    setCurrentPage(1)
  }, [quickFilter, dateRange, directionFilter, resultFilter])

  const metrics = useMemo(() => {
    const closedTrades = filteredTrades.filter(
      (trade) => typeof trade.net_pnl === "number",
    )
    const wins = closedTrades.filter((trade) => (trade.net_pnl ?? 0) > 0)
    const losses = closedTrades.filter((trade) => (trade.net_pnl ?? 0) < 0)
    const netPnl = closedTrades.reduce(
      (total, trade) => total + (trade.net_pnl ?? 0),
      0,
    )

    return {
      total: filteredTrades.length,
      closed: closedTrades.length,
      netPnl,
      winRate: closedTrades.length ? (wins.length / closedTrades.length) * 100 : 0,
      averagePnl: closedTrades.length ? netPnl / closedTrades.length : 0,
      wins: wins.length,
      losses: losses.length,
    }
  }, [filteredTrades])

  const totalPages = Math.max(1, Math.ceil(filteredTrades.length / rowsPerPage))
  const paginatedTrades = filteredTrades.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage,
  )

  const summaryCards = [
    { label: "Total trades", value: metrics.total.toString() },
    { label: "Closed trades", value: metrics.closed.toString() },
    {
      label: "Net P&L",
      value: currency.format(metrics.netPnl),
      tone: metrics.netPnl >= 0 ? "positive" : "negative",
    },
    { label: "Win rate", value: `${metrics.winRate.toFixed(1)}%` },
    {
      label: "Average P&L",
      value: currency.format(metrics.averagePnl),
      tone: metrics.averagePnl >= 0 ? "positive" : "negative",
    },
    { label: "Wins / Losses", value: `${metrics.wins} / ${metrics.losses}` },
  ]

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Performance analysis
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Trading Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Analyze your real journal records across any period.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <Card key={card.label} className="rounded-2xl border-border/60 shadow-sm">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
              <p
                className={cn(
                  "mt-2 text-xl font-semibold",
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

      <Card className="rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4 text-primary" />
            Report filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex flex-wrap gap-3">
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Direction" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All directions</SelectItem>
                <SelectItem value="Buy">Buy</SelectItem>
                <SelectItem value="Sell">Sell</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={resultFilter}
              onValueChange={(value) => setResultFilter(value as ResultFilter)}
            >
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="profit">Profitable</SelectItem>
                <SelectItem value="loss">Losses</SelectItem>
                <SelectItem value="open">Open trades</SelectItem>
              </SelectContent>
            </Select>

            <Select value={quickFilter} onValueChange={setQuickFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All time</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {quickFilter === "custom" && (
            <div className="mt-4 w-fit rounded-xl border border-border/60 p-2">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={1}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
        <CardHeader className="border-b border-border/60">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4 text-primary" />
            Filtered trades ({loading ? "—" : filteredTrades.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead className="text-right">P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        Loading your report...
                      </p>
                    </TableCell>
                  </TableRow>
                ) : paginatedTrades.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-36 text-center text-muted-foreground">
                      {trades.length === 0
                        ? "No trades recorded yet."
                        : "No trades match the selected filters."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedTrades.map((trade) => {
                    const isClosed = typeof trade.net_pnl === "number"
                    const isProfit = (trade.net_pnl ?? 0) > 0
                    const isLoss = (trade.net_pnl ?? 0) < 0

                    return (
                      <TableRow key={trade.id}>
                        <TableCell>
                          {format(
                            parseISO(`${trade.entry_date.slice(0, 10)}T00:00:00`),
                            "dd MMM yyyy",
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{trade.instrument}</TableCell>
                        <TableCell>
                          <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                            {trade.trade_type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{isClosed ? "Closed" : "Open"}</Badge>
                        </TableCell>
                        <TableCell>
                          {trade.quantity} {trade.quantity_mode === "lots" ? "lots" : "units"}
                        </TableCell>
                        <TableCell>{trade.strategy || "—"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-semibold",
                            isClosed && isProfit && "text-emerald-500",
                            isClosed && isLoss && "text-rose-500",
                          )}
                        >
                          {!isClosed ? (
                            "—"
                          ) : (
                            <span className="inline-flex items-center gap-1">
                              {isProfit ? (
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              ) : isLoss ? (
                                <ArrowDownRight className="h-3.5 w-3.5" />
                              ) : null}
                              {currency.format(trade.net_pnl ?? 0)}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border/60 px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPage((page) => Math.min(totalPages, page + 1))
                  }
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
