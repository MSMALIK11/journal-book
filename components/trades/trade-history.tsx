



"use client"

import { useState, useMemo } from "react"
import { format } from "date-fns"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Edit, Trash2, Search, Plus } from "lucide-react"
import { TradeForm } from "./trade-form"
import { useUserTradeHistory } from "@/hooks/useUser"
import Loading from '@/components/shared/loading'
import ConfirmationModal from "../shared/ConfirmationModel"
import { useToast } from "@/hooks/use-toast"
import api from '@/services'
import { useQueryClient } from "@tanstack/react-query"
export function TradeHistory() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [filterStrategy, setFilterStrategy] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)
  const[deleteTradeId,setDeleteTradeId]=useState("")
  const [initialData,setInitialData]=useState(null)
  const [isDeleting,setIsDeleting]=useState(false)
  const [open, setOpen] = useState(false)
  const {toast}=useToast()
  const queryClient=useQueryClient()
  const tradesPerPage = 10

  const { data, isLoading } = useUserTradeHistory()
  const trades = data?.data?.trades || []
console.log(trades)
  // Unique strategies for filter dropdown
  const strategies = useMemo(() => {
    const allStrategies = trades.map((t) => t.strategy).filter(Boolean)
    return Array.from(new Set(allStrategies))
  }, [trades])

  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const matchesSearch =
        trade.instrument?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        trade.strategy?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesType =
        filterType === "all"
          ? true
          : filterType === "profit"
          ? trade.net_pnl > 0
          : trade.net_pnl < 0

      const matchesStrategy =
        filterStrategy === "all" ? true : trade.strategy === filterStrategy

      return matchesSearch && matchesType && matchesStrategy
    })
  }, [trades, searchTerm, filterType, filterStrategy])

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / tradesPerPage)
  const paginatedTrades = useMemo(() => {
    const start = (currentPage - 1) * tradesPerPage
    return filteredTrades.slice(start, start + tradesPerPage)
  }, [filteredTrades, currentPage])

  const deleteTrade = (tradeId: string) => {
    console.log("Delete trade with ID:", tradeId)
    // API call to delete can go here
    setDeleteTradeId(tradeId)
  }



const handleDelete = async () => {
  if (!deleteTradeId) return;
setIsDeleting(true)
  try {
    toast({

      title: "Deleting trade...",
      description: "Please wait while the trade is being deleted.",
    });

    const response = await api.trade.delete(deleteTradeId);
    if (response.status !== 200) {
      throw new Error("Failed to delete trade");
    }
    toast({
      title: "Success",
      description: "Trade deleted successfully.",
    });

    setDeleteTradeId("");
   queryClient.invalidateQueries({ queryKey: ['user-trade-history'] })
  } catch (error: any) {
    toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
  }finally {  
    setIsDeleting(false)
  }
  setDeleteTradeId("");
};

const handleEdit=(trade)=>{
  setOpen(true)
  setInitialData(trade)
}
    if (isLoading) {
    return <Loading isLoading={isLoading} />
  }
  return (
    <div className="space-y-6">
      <TradeForm open={open} setOpen={setOpen} initialData={initialData} />
      <ConfirmationModal   isOpen={!!deleteTradeId} loading={isDeleting} onDelete={handleDelete} />
      <Card className="relative">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Search & Filter
          </CardTitle>
          <Button
            onClick={() => setOpen(true)}
            className="rounded-full w-8 h-8 shadow-lg absolute right-4 top-4"
          >
            <Plus />
          </Button>
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
                      <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                        {trade.trade_type}
                      </Badge>
                    </TableCell>
                    <TableCell>₹{trade.entry_price}</TableCell>
                    <TableCell>{trade.exit_price ? `₹${trade.exit_price}` : "-"}</TableCell>
                    <TableCell>{trade.quantity}</TableCell>
                    <TableCell>
                      {trade.net_pnl !== null ? (
                        <span className={Number(trade.net_pnl) >= 0 ? "text-green-600" : "text-red-600"}>
                          ₹{Number(trade.net_pnl)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{trade.strategy && <Badge variant="outline">{trade.strategy}</Badge>}</TableCell>
                    <TableCell>{trade.emotion_tag && <Badge variant="outline">{trade.emotion_tag}</Badge>}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={()=>handleEdit(trade)}>
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
