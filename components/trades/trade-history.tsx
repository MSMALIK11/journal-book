"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Search, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"

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
  const [filterType, setFilterType] = useState("all")
  const [filterStrategy, setFilterStrategy] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const tradesPerPage = 10

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
    let filtered = trades

    if (searchTerm) {
      filtered = filtered.filter(
        (trade) =>
          trade.instrument.toLowerCase().includes(searchTerm.toLowerCase()) ||
          trade.strategy?.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    }

    if (filterType !== "all") {
      if (filterType === "profit") {
        filtered = filtered.filter((trade) => trade.net_pnl > 0)
      } else if (filterType === "loss") {
        filtered = filtered.filter((trade) => trade.net_pnl < 0)
      }
    }

    if (filterStrategy !== "all") {
      filtered = filtered.filter((trade) => trade.strategy === filterStrategy)
    }

    return filtered
  }, [trades, searchTerm, filterType, filterStrategy])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterType, filterStrategy])

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

  const paginatedTrades = filteredTrades.slice((currentPage - 1) * tradesPerPage, currentPage * tradesPerPage)
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage)
  const strategies = Array.from(
    new Set(trades.map((trade) => trade.strategy).filter((strategy): strategy is string => Boolean(strategy))),
  )

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by instrument or strategy..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Filter by P&L" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Trades</SelectItem>
                <SelectItem value="profit">Profitable</SelectItem>
                <SelectItem value="loss">Loss Making</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStrategy} onValueChange={setFilterStrategy}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Filter by Strategy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strategies</SelectItem>
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

      <Card>
        <CardHeader>
          <CardTitle>Trade History ({filteredTrades.length} trades)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Emotion</TableHead>
                  <TableHead>Actions</TableHead>
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
                ) : paginatedTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>
                      {format(new Date(`${trade.entry_date.slice(0, 10)}T00:00:00`), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="font-medium">{trade.instrument}</TableCell>
                    <TableCell>
                      <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>{trade.trade_type}</Badge>
                    </TableCell>
                    <TableCell>{currency.format(trade.entry_price)}</TableCell>
                    <TableCell>{trade.exit_price ? currency.format(trade.exit_price) : "—"}</TableCell>
                    <TableCell>
                      {trade.quantity} {trade.quantity_mode === "lots" ? "lots" : "units"}
                    </TableCell>
                    <TableCell>
                      {typeof trade.net_pnl === "number" ? (
                        <span className={trade.net_pnl >= 0 ? "text-green-600" : "text-red-600"}>
                          {currency.format(trade.net_pnl)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{trade.strategy && <Badge variant="outline">{trade.strategy}</Badge>}</TableCell>
                    <TableCell>{trade.emotion_tag && <Badge variant="outline">{trade.emotion_tag}</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
