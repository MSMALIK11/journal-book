"use client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { CalendarIcon, Plus, Trash2, Pencil } from "lucide-react"
import { format, isToday, isYesterday, parseISO } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Stock {
  id: number
  symbol: string
  direction: "Buy" | "Sell"
  tags: string[]
  resultDate: string
  event?: string
  createdAt: string
}

const mockStocks: Stock[] = [
  {
    id: 1,
    symbol: "INFY",
    direction: "Buy",
    tags: ["Breakout"],
    resultDate: "2025-08-04",
    event: "Q1 Result",
    createdAt: "2025-08-04"
  },
  {
    id: 2,
    symbol: "TCS",
    direction: "Sell",
    tags: ["Earnings", "Breakdown"],
    resultDate: "2025-08-03",
    createdAt: "2025-08-03"
  },
  {
    id: 3,
    symbol: "HDFCBANK",
    direction: "Buy",
    tags: ["Breakout"],
    resultDate: "2025-08-06",
    createdAt: "2025-08-04"
  }
]

export default function StockManager() {
  const [stocks, setStocks] = useState<Stock[]>(mockStocks)
  const [filterDirection, setFilterDirection] = useState<string>("")
  const [filterTag, setFilterTag] = useState<string>("")
  const [filterDate, setFilterDate] = useState<Date | undefined>()
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const [newStock, setNewStock] = useState<Partial<Stock>>({
    direction: "Buy",
    tags: [],
    createdAt: format(new Date(), "yyyy-MM-dd")
  })

  const filteredStocks = stocks.filter(stock => {
    return (
      (!filterDirection || stock.direction === filterDirection) &&
      (!filterTag || stock.tags.includes(filterTag)) &&
      (!filterDate || stock.resultDate === format(filterDate, "yyyy-MM-dd"))
    )
  })

  const groupedByDay = filteredStocks.reduce((acc, stock) => {
    if (!acc[stock.createdAt]) acc[stock.createdAt] = []
    acc[stock.createdAt].push(stock)
    return acc
  }, {} as Record<string, Stock[]>)

  const addStock = () => {
    if (!newStock.symbol || !newStock.resultDate) return
    const stock: Stock = {
      ...newStock,
      id: Date.now(),
      symbol: newStock.symbol.toUpperCase(),
      tags: newStock.tags || [],
      direction: newStock.direction as "Buy" | "Sell",
      resultDate: newStock.resultDate,
      event: newStock.event || "",
      createdAt: newStock.createdAt || format(new Date(), "yyyy-MM-dd")
    }
    setStocks(prev => [...prev, stock])
  }

  const deleteStock = (id: number) => {
    setStocks(prev => prev.filter(s => s.id !== id))
  }

  const renderDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr)
    if (isToday(date)) return "Today"
    if (isYesterday(date)) return "Yesterday"
    return format(date, "EEE, dd MMM")
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 items-center">
          <Input placeholder="Filter by tag" value={filterTag} onChange={e => setFilterTag(e.target.value)} />
          <Input placeholder="Direction (Buy/Sell)" value={filterDirection} onChange={e => setFilterDirection(e.target.value)} />
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="flex gap-2 items-center">
                <CalendarIcon className="w-4 h-4" />
                {filterDate ? format(filterDate, "PPP") : "Filter by Result Date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <Calendar mode="single" selected={filterDate} onSelect={setFilterDate} initialFocus />
            </PopoverContent>
          </Popover>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> Add Stock</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Stock</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Input placeholder="Symbol (e.g., INFY)" onChange={e => setNewStock({ ...newStock, symbol: e.target.value })} />
              <select className="border rounded px-3 py-2" onChange={e => setNewStock({ ...newStock, direction: e.target.value as "Buy" | "Sell" })}>
                <option>Buy</option>
                <option>Sell</option>
              </select>
              <Input placeholder="Tags (comma-separated)" onChange={e => setNewStock({ ...newStock, tags: e.target.value.split(",") })} />
              <Input placeholder="Event (e.g., Q1 Result)" onChange={e => setNewStock({ ...newStock, event: e.target.value })} />
              <Input type="date" onChange={e => setNewStock({ ...newStock, resultDate: e.target.value })} />
              <Button onClick={addStock}>Add</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {selectedDay ? (
 <div className="space-y-4">
  <Button variant="ghost" onClick={() => setSelectedDay(null)}>← Back</Button>
  <h2 className="text-2xl font-semibold">Stocks on {renderDateLabel(selectedDay)}</h2>

  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Symbol</TableHead>
        <TableHead>Direction</TableHead>
        <TableHead>Tags</TableHead>
        <TableHead>Result Date</TableHead>
        <TableHead>Event</TableHead>
        <TableHead className="text-right">Actions</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {groupedByDay[selectedDay]?.map(stock => (
        <TableRow key={stock.id}>
          <TableCell className="font-medium">{stock.symbol}</TableCell>
          <TableCell>
            <Badge variant={stock.direction === "Buy" ? "default" : "destructive"}>
              {stock.direction}
            </Badge>
          </TableCell>
          <TableCell>
            <div className="flex gap-1 flex-wrap">
              {stock.tags.map(tag => (
                <Badge key={tag} variant="outline">{tag}</Badge>
              ))}
            </div>
          </TableCell>
          <TableCell>{stock.resultDate}</TableCell>
          <TableCell>{stock.event || "-"}</TableCell>
          <TableCell className="text-right">
            <Button variant="destructive" size="sm" onClick={() => deleteStock(stock.id)}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
</div>
      ) : (
        <div className="space-y-6">
          {Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a)).map(day => (
            <div key={day}>
              <h2 className="text-xl font-bold mb-2">{renderDateLabel(day)}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedByDay[day].map(stock => (
                  <Card key={stock.id} onClick={() => setSelectedDay(day)} className="cursor-pointer hover:shadow-lg transition">
                    <CardHeader className="flex justify-between items-center">
                      <CardTitle>{stock.symbol}</CardTitle>
                      <Badge variant={stock.direction === "Buy" ? "default" : "destructive"}>{stock.direction}</Badge>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      <div className="flex flex-wrap gap-2">
                        {stock.tags.map(tag => <Badge key={tag} variant="outline">{tag}</Badge>)}
                      </div>
                      <p>📅 {stock.resultDate}</p>
                      {isToday(parseISO(stock.resultDate)) && <p className="text-green-600 font-semibold">🟢 Result is Today</p>}
                      {isYesterday(parseISO(stock.resultDate)) && <p className="text-yellow-600 font-semibold">🟡 Result was Yesterday</p>}
                      {stock.event && <p>📌 {stock.event}</p>}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
