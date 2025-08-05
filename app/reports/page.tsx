"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ArrowUp, ArrowDown } from "lucide-react"
import { format, isWithinInterval, parseISO, subDays } from "date-fns"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { DateRange } from "react-day-picker"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Trade = {
  id: string
  symbol: string
  type: "Buy" | "Sell"
  result: "Profit" | "Loss"
  amount: number
  date: string
}

const mockReportData = [
  { id: "T001", symbol: "BANKNIFTY", type: "Buy", result: "Profit", amount: 1200, date: "2025-08-01" },
  { id: "T002", symbol: "NIFTY", type: "Sell", result: "Loss", amount: -700, date: "2025-08-02" },
  { id: "T003", symbol: "RELIANCE", type: "Buy", result: "Profit", amount: 450, date: "2025-08-02" },
  { id: "T004", symbol: "TCS", type: "Sell", result: "Loss", amount: -300, date: "2025-08-03" },
  { id: "T005", symbol: "INFY", type: "Buy", result: "Profit", amount: 650, date: "2025-07-29" },
  { id: "T006", symbol: "SBIN", type: "Buy", result: "Loss", amount: -250, date: "2025-07-24" },
]

export default function ReportPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [filteredTrades, setFilteredTrades] = useState<Trade[]>(mockReportData)
  const [typeFilter, setTypeFilter] = useState("all")
  const [resultFilter, setResultFilter] = useState("all")
  const [quickFilter, setQuickFilter] = useState("all")

  useEffect(() => {
    let trades = [...mockReportData]

    // Date filter
    if (quickFilter === "7d") {
      const start = subDays(new Date(), 7)
      trades = trades.filter((trade) =>
        isWithinInterval(parseISO(trade.date), { start, end: new Date() })
      )
    } else if (quickFilter === "30d") {
      const start = subDays(new Date(), 30)
      trades = trades.filter((trade) =>
        isWithinInterval(parseISO(trade.date), { start, end: new Date() })
      )
    } else if (quickFilter === "custom" && dateRange?.from && dateRange?.to) {
      trades = trades.filter((trade) =>
        isWithinInterval(parseISO(trade.date), { start: dateRange.from!, end: dateRange.to! })
      )
    }

    // Type & Result Filters
    if (typeFilter !== "all") trades = trades.filter((t) => t.type === typeFilter)
    if (resultFilter !== "all") trades = trades.filter((t) => t.result === resultFilter)

    setFilteredTrades(trades)
  }, [dateRange, typeFilter, resultFilter, quickFilter])

  // Summary stats
  const totalProfit = filteredTrades.reduce((sum, t) => sum + t.amount, 0)
  const winCount = filteredTrades.filter((t) => t.result === "Profit").length
  const lossCount = filteredTrades.filter((t) => t.result === "Loss").length
  const avgPnl = filteredTrades.length > 0 ? totalProfit / filteredTrades.length : 0
  const winRate = filteredTrades.length > 0 ? (winCount / filteredTrades.length) * 100 : 0

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold">📊 Trading Report</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card><CardContent className="p-4"><p className="text-gray-500">Total Trades</p><p className="text-2xl font-bold">{filteredTrades.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-gray-500">Total P&L</p><p className={`text-2xl font-bold ${totalProfit >= 0 ? "text-green-600" : "text-red-500"}`}>₹ {totalProfit}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-gray-500">Win Rate</p><p className="text-2xl font-bold">{winRate.toFixed(1)}%</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-gray-500">Avg P&L</p><p className={`text-2xl font-bold ${avgPnl >= 0 ? "text-green-600" : "text-red-500"}`}>₹ {avgPnl.toFixed(2)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-gray-500">Wins / Losses</p><p className="text-2xl font-bold">{winCount} / {lossCount}</p></CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Trade Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="Buy">Buy</SelectItem>
            <SelectItem value="Sell">Sell</SelectItem>
          </SelectContent>
        </Select>

        <Select value={resultFilter} onValueChange={setResultFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Result" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="Profit">Profit</SelectItem>
            <SelectItem value="Loss">Loss</SelectItem>
          </SelectContent>
        </Select>

        <Select value={quickFilter} onValueChange={setQuickFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Date Range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="7d">Last 7 Days</SelectItem>
            <SelectItem value="30d">Last 30 Days</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>

        {quickFilter === "custom" && (
          <div className="mt-2">
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} />
          </div>
        )}
      </div>

      {/* Trade Table */}
      <div>
        <h2 className="text-xl font-semibold mb-4">📅 Filtered Trades ({filteredTrades.length})</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Symbol</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Result</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTrades.map((trade) => (
              <TableRow key={trade.id}>
                <TableCell>{trade.id}</TableCell>
                <TableCell>{trade.symbol}</TableCell>
                <TableCell>{trade.type}</TableCell>
                <TableCell className={trade.result === "Profit" ? "text-green-600" : "text-red-500"}>
                  {trade.result === "Profit" ? <ArrowUp className="inline w-4 h-4" /> : <ArrowDown className="inline w-4 h-4" />}
                  {` ${trade.result}`}
                </TableCell>
                <TableCell className={trade.amount >= 0 ? "text-green-600" : "text-red-500"}>₹ {trade.amount}</TableCell>
                <TableCell>{format(parseISO(trade.date), "dd MMM yyyy")}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
