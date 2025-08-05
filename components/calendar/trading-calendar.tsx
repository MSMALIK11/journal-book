"use client"

import { useState, useEffect } from "react"
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from "date-fns"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

// Mock trade data
const mockTrades = [
  {
    id: "1",
    user_id: "mock-user",
    instrument: "NIFTY",
    trade_type: "Buy",
    entry_date: "2025-08-02",
    entry_price: 19800,
    exit_price: 19950,
    quantity: 2,
    net_pnl: 300,
    strategy: "Breakout",
  },
  {
    id: "2",
    user_id: "mock-user",
    instrument: "BANKNIFTY",
    trade_type: "Sell",
    entry_date: "2025-08-02",
    entry_price: 44500,
    exit_price: 44300,
    quantity: 1,
    net_pnl: 200,
    strategy: "Reversal",
  },
  {
    id: "3",
    user_id: "mock-user",
    instrument: "FINNIFTY",
    trade_type: "Buy",
    entry_date: "2025-08-01",
    entry_price: 20300,
    exit_price: 20200,
    quantity: 1,
    net_pnl: -100,
    strategy: "Trend",
  },
  {
    id: "4",
    user_id: "mock-user",
    instrument: "NIFTY",
    trade_type: "Sell",
    entry_date: "2025-08-03",
    entry_price: 19800,
    exit_price: 19900,
    quantity: 1,
    net_pnl: -100,
    strategy: "Scalping",
  },
]

export function TradingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [trades, setTrades] = useState<any[]>([])
  const [dailyPnL, setDailyPnL] = useState<Record<string, number>>({})
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTrades, setSelectedTrades] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTrades()
  }, [currentDate])

  const loadTrades = async () => {
    setLoading(true)
    // Simulate delay
    setTimeout(() => {
      const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd")
      const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd")

      const filtered = mockTrades.filter(
        (trade) => trade.entry_date >= monthStart && trade.entry_date <= monthEnd,
      )

      setTrades(filtered)

      const pnlByDate = filtered.reduce((acc, trade) => {
        const date = trade.entry_date
        if (!acc[date]) acc[date] = 0
        if (trade.net_pnl) acc[date] += trade.net_pnl
        return acc
      }, {} as Record<string, number>)

      setDailyPnL(pnlByDate)
      setLoading(false)
    }, 500)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    const dateStr = format(date, "yyyy-MM-dd")
    const dayTrades = trades.filter((trade) => trade.entry_date === dateStr)
    setSelectedTrades(dayTrades)
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev)
      newDate.setMonth(prev.getMonth() + (direction === "next" ? 1 : -1))
      return newDate
    })
  }

  const days = eachDayOfInterval({
    start: startOfMonth(currentDate),
    end: endOfMonth(currentDate),
  })

  const getDayPnL = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    return dailyPnL[dateStr] || 0
  }

  const getDayColor = (date: Date) => {
    const pnl = getDayPnL(date)
    if (pnl > 0) return "bg-green-100 text-green-800 border-green-200"
    if (pnl < 0) return "bg-red-100 text-red-800 border-red-200"
    return "bg-gray-50 text-gray-600 border-gray-200"
  }

  if (loading) {
    return <div className="flex justify-center p-8">Loading calendar...</div>
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{format(currentDate, "MMMM yyyy")}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="icon" onClick={() => navigateMonth("prev")}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" onClick={() => navigateMonth("next")}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2 mb-4">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-2">
                {days.map((day) => {
                  const pnl = getDayPnL(day)
                  const hasTrades = pnl !== 0
                  const isSelected = selectedDate && isSameDay(day, selectedDate)

                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => handleDateClick(day)}
                      className={cn(
                        "p-2 text-sm border rounded-lg transition-colors min-h-[60px] flex flex-col items-center justify-center",
                        getDayColor(day),
                        isSelected && "ring-2 ring-primary",
                        !isSameMonth(day, currentDate) && "opacity-50",
                        hasTrades && "cursor-pointer hover:opacity-80",
                      )}
                    >
                      <span className="font-medium">{format(day, "d")}</span>
                      {hasTrades && <span className="text-xs font-bold">₹{pnl.toFixed(0)}</span>}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                  <span>Profit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
                  <span>Loss</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-50 border border-gray-200 rounded"></div>
                  <span>No Trades</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle>{selectedDate ? format(selectedDate, "dd MMM yyyy") : "Select a Date"}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedDate && selectedTrades.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-center p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Daily P&L</div>
                    <div
                      className={cn(
                        "text-2xl font-bold",
                        getDayPnL(selectedDate) >= 0 ? "text-green-600" : "text-red-600",
                      )}
                    >
                      ₹{getDayPnL(selectedDate).toFixed(2)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-medium">Trades ({selectedTrades.length})</h4>
                    {selectedTrades.map((trade) => (
                      <div key={trade.id} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{trade.instrument}</span>
                          <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                            {trade.trade_type}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {trade.quantity} @ ₹{trade.entry_price}
                          {trade.exit_price && ` → ₹${trade.exit_price}`}
                        </div>
                        {trade.net_pnl !== null && (
                          <div
                            className={cn(
                              "text-sm font-medium",
                              trade.net_pnl >= 0 ? "text-green-600" : "text-red-600",
                            )}
                          >
                            P&L: ₹{trade.net_pnl.toFixed(2)}
                          </div>
                        )}
                        {trade.strategy && (
                          <Badge variant="outline" className="text-xs">
                            {trade.strategy}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedDate ? (
                <div className="text-center text-muted-foreground py-8">No trades on this date</div>
              ) : (
                <div className="text-center text-muted-foreground py-8">Click on a date to view trades</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
