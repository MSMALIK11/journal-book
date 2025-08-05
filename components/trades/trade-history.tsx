"use client"

import { useState, useEffect } from "react"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Edit, Trash2, Search } from "lucide-react"

// ✅ Mock trades data
const MOCK_TRADES = [
  {
    id: "1",
    entry_date: "2025-08-01",
    instrument: "NIFTY",
    trade_type: "Buy",
    entry_price: 20000,
    exit_price: 20150,
    quantity: 1,
    net_pnl: 150,
    strategy: "Breakout",
    emotion_tag: "Confident",
  },
  {
    id: "2",
    entry_date: "2025-08-02",
    instrument: "BANKNIFTY",
    trade_type: "Sell",
    entry_price: 44000,
    exit_price: 43800,
    quantity: 2,
    net_pnl: 400,
    strategy: "Reversal",
    emotion_tag: "Calm",
  },
  {
    id: "3",
    entry_date: "2025-08-03",
    instrument: "RELIANCE",
    trade_type: "Buy",
    entry_price: 2600,
    exit_price: 2550,
    quantity: 10,
    net_pnl: -500,
    strategy: "Scalping",
    emotion_tag: "Fearful",
  },
  // Add more mock trades here as needed
]

export function TradeHistory() {
  const [trades, setTrades] = useState<any[]>([])
  const [filteredTrades, setFilteredTrades] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStrategy, setFilterStrategy] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const tradesPerPage = 10

  useEffect(() => {
    setTrades(MOCK_TRADES)
  }, [])

  useEffect(() => {
    filterTrades()
  }, [trades, searchTerm, filterType, filterStrategy])

  const filterTrades = () => {
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

    setFilteredTrades(filtered)
    setCurrentPage(1)
  }

  const deleteTrade = (tradeId: string) => {
    if (!confirm("Are you sure you want to delete this trade?")) return
    const updated = trades.filter((trade) => trade.id !== tradeId)
    setTrades(updated)
  }

  const paginatedTrades = filteredTrades.slice((currentPage - 1) * tradesPerPage, currentPage * tradesPerPage)
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage)
  const strategies = [...new Set(trades.map((trade) => trade.strategy).filter(Boolean))]

  return (
    <div className="space-y-6">
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
                  <TableHead>Qty</TableHead>
                  <TableHead>P&L</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Emotion</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTrades.map((trade) => (
                  <TableRow key={trade.id}>
                    <TableCell>{format(new Date(trade.entry_date), "dd/MM/yyyy")}</TableCell>
                    <TableCell className="font-medium">{trade.instrument}</TableCell>
                    <TableCell>
                      <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>{trade.trade_type}</Badge>
                    </TableCell>
                    <TableCell>₹{trade.entry_price}</TableCell>
                    <TableCell>{trade.exit_price ? `₹${trade.exit_price}` : "-"}</TableCell>
                    <TableCell>{trade.quantity}</TableCell>
                    <TableCell>
                      {trade.net_pnl !== null ? (
                        <span className={trade.net_pnl >= 0 ? "text-green-600" : "text-red-600"}>
                          ₹{trade.net_pnl.toFixed(2)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{trade.strategy && <Badge variant="outline">{trade.strategy}</Badge>}</TableCell>
                    <TableCell>{trade.emotion_tag && <Badge variant="outline">{trade.emotion_tag}</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteTrade(trade.id)}>
                          <Trash2 className="h-4 w-4" />
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
