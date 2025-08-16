"use client"

import { useState, useEffect } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Pencil } from "lucide-react"
import { format } from "date-fns"
import { Remark, Stock } from "../types/stock"
import api  from '@/services'
import { useToast } from "@/hooks/use-toast"
import { useUserstocks } from "@/hooks/useUser"
import Loaidng from "@/components/shared/loading"
import { useQueryClient } from "@tanstack/react-query"
const sectorList = [
  "Technology",
  "Finance",
  "Healthcare",
  "Energy",
  "Consumer Goods",
  "Utilities",
  "Industrials",
  "Materials",
  "Real Estate",
  "Telecommunications",
]

const initialStocks: Stock[] = [
  {
    id: 1,
    symbol: "INFY",
    sector: "Technology",
    expectedDirection: "Up",
    expectedNotes: "Strong Q2 performance expected",
    actualDirection: "Up",
    actualNotes: "Beat expectations",
    remarks: [{ id: 1, text: "Good earnings report" }],
    resultDate: "2025-08-10",
    event: "Q2 Result",
  },
  {
    id: 2,
    symbol: "HDFCBANK",
    sector: "Finance",
    expectedDirection: "Down",
    expectedNotes: "Concerns about loan growth",
    actualDirection: "Neutral",
    actualNotes: "Stable quarter",
    remarks: [{ id: 1, text: "Loan growth slower than expected" }],
    resultDate: "2025-08-11",
    event: "Q2 Result",
  },
]

export default function StockManager() {

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editStockId, setEditStockId] = useState<number | null>(null)
  const [formData, setFormData] = useState<Omit<Stock, "id" | "remarks" | "actualDirection" | "actualNotes">>({
    symbol: "",
    sector: "",
    currentPrice: "",
    expectedPrice: "",
    expectedDirection: "Neutral",
    expectedNotes: "",
    resultDate: "",
    event: "",
  })
  const [remarks, setRemarks] = useState<Remark[]>([])
  const [newRemarkText, setNewRemarkText] = useState("")
const {toast}=useToast()
const queryClient = useQueryClient()
const {data,isLoading}=useUserstocks()
const stocks=data?.data.stocks

  // When editing, populate form
  useEffect(() => {
    if (editStockId !== null) {
      const stock = stocks.find(s => s._id === editStockId)
      if (stock) {
        setFormData({
          symbol: stock.symbol,
          sector: stock.sector,
          currentPrice: stock.currentPrice,
          expectedDirection: stock.expectedDirection,
          expectedNotes: stock.expectedNotes,
          resultDate: stock.resultDate,
          event: stock.event || "",
        })
        setRemarks(stock.remarks || [])
      }
      setDialogOpen(true)
    } else {
      resetForm()
    }
  }, [editStockId])
  

  function resetForm(close=true) {
    setFormData({
      symbol: "",
      sector: "",
      expectedDirection: "Neutral",
      expectedNotes: "",
      resultDate: "",
      event: "",
    })
    setRemarks([])
    setNewRemarkText("")
    setDialogOpen(false)
      if (close) setDialogOpen(false)
  }

  async function saveStock() {
    if (!formData.symbol || !formData.sector || !formData.resultDate) {
      alert("Please fill required fields: Symbol, Sector, Result Date")
      return
    }

    if (editStockId !== null) {
    try {
      const response = await api.stock.updateStock(formData as Stock,editStockId)
      if (response.status === 200) {
        const updatedStock = response.data.stock as Stock
        queryClient.invalidateQueries({ queryKey: ["user-stocks"] }) 
        toast({ title: "Stock updated successfully", description: `Symbol: ${updatedStock.symbol}` })
        setEditStockId(null) // Reset edit mode
      }
      
    } catch (error) {
      console.error("Error updating stock:", error)
      toast({ title: "Failed to update stock", description: "Please try again later", variant: "destructive" })
      
    }
    
    } else {  
      // Add new
    try {
      const response= await api.stock.addStock(formData as Stock)
    console.log('res',response)
    if(response.status === 201) {
      const newStock = response.data.stock as Stock
        queryClient.invalidateQueries({ queryKey: ["user-stocks"] }) 
      toast({ title: "Stock added successfully",description: `Symbol: ${newStock.symbol}` })
    
    } 
    } catch (error) {
      console.error("Error adding stock:", error)
      toast({ title: "Failed to add stock", description: "Please try again later", variant: "destructive" })
      
    }
    }

    resetForm()
  }

 const deleteStock = async (id: number) => {
try {
  const response = await api.stock.deleteStock(id.toString())
  if (response.status === 200) {
    toast({ title: "Stock deleted successfully", description: `ID: ${id}` })
  }
  
} catch (error) {
  console.error("Error deleting stock:", error)
  toast({ title: "Failed to delete stock", description: "Please try again later", variant: "destructive" })
  
}
   
 }

  function addRemark() {
    if (newRemarkText.trim() === "") return
    setRemarks(prev => [...prev, { id: Date.now(), text: newRemarkText.trim() }])
    setNewRemarkText("")
  }

  function deleteRemark(id: number) {
    setRemarks(prev => prev.filter(r => r.id !== id))
  }
  if (isLoading) {
    return <Loaidng isLoading={isLoading} />
  }

 
  return (
    <div className="p-6 space-y-6">

      <div className="flex justify-between items-center">
        
        <h1 className="text-3xl font-bold">Stock Manager</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button   onClick={() => {
        setEditStockId(null)
        resetForm(false) 
        setDialogOpen(true)
      }}>
              <Plus className="w-4 h-4 mr-1" />
              Add Stock
            </Button>
          </DialogTrigger>
        <DialogContent className="lg:min-w-4xl max-w-7xl">
            <DialogHeader>
              <DialogTitle>{editStockId !== null ? "Edit Stock" : "Add New Stock"}</DialogTitle>
            </DialogHeader>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label>Symbol *</Label>
                <Input
                  value={formData.symbol}
                  onChange={e => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  placeholder="e.g. INFY"
                />
              </div>
              <div>
                <Label>Sector *</Label>
                <Select
                  value={formData.sector}
                  onValueChange={value => setFormData({ ...formData, sector: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent>
                    {sectorList.map(sec => (
                      <SelectItem key={sec} value={sec}>
                        {sec}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Current Price</Label>
                <Input
                  value={formData.currentPrice}
                  onChange={e => setFormData({ ...formData, currentPrice: e.target.value })}
                  placeholder="e.g. INFY"
                />
              </div>
              <div>
                <Label>Expected Direction *</Label>
                <Select
                  value={formData.expectedDirection}
                  onValueChange={value =>
                    setFormData({ ...formData, expectedDirection: value as "Up" | "Down" | "Neutral" })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select expected direction" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Up">Up</SelectItem>
                    <SelectItem value="Down">Down</SelectItem>
                    <SelectItem value="Neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Expected Notes</Label>
                <Textarea
                  value={formData.expectedNotes}
                  onChange={e => setFormData({ ...formData, expectedNotes: e.target.value })}
                  placeholder="Your notes about expected performance"
                />
              </div>
              <div>
                <Label>Result Date *</Label>
                <Input
                  type="date"
                  value={formData.resultDate}
                  onChange={e => setFormData({ ...formData, resultDate: e.target.value })}
                />
              </div>
              <div>
                <Label>Event (optional)</Label>
                <Input
                  value={formData.event}
                  onChange={e => setFormData({ ...formData, event: e.target.value })}
                  placeholder="E.g. Q2 Earnings"
                />
              </div>

              {/* Remarks Section */}
              <div>
                <Label>Remarks</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    placeholder="Add remark"
                    value={newRemarkText}
                    onChange={e => setNewRemarkText(e.target.value)}
                  />
                  {/* <Button onClick={addRemark}>Add</Button> */}
                        <Button
                        size={"sm"}
       onClick={addRemark}
        className="rounded-full h-8 w-8  shadow-lg"
      >
        <Plus className="w-6 h-6" />
      </Button>


                  
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto border p-2 rounded">
                  {remarks.length === 0 && <p className="text-sm text-gray-500">No remarks added</p>}
                  {remarks.map(r => (
                    <div
                      key={r.id}
                      className="flex justify-between items-center rounded px-2 py-1"
                    >
                      <span>{r.text}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteRemark(r.id)}
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

             
            </div>
             <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={resetForm}>
                  Cancel
                </Button>
                <Button onClick={saveStock}>
                  {editStockId !== null ? "Update Stock" : "Add Stock"}
                </Button>
              </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Symbol</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>Expected Direction</TableHead>
            <TableHead>Expected Notes</TableHead>
            <TableHead>Result Date</TableHead>
            <TableHead>Event</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stocks.map(stock => (
            <TableRow key={stock.id}>
              <TableCell>{stock.symbol}</TableCell>
              <TableCell>{stock.sector}</TableCell>
              <TableCell>{stock.expectedDirection}</TableCell>
              <TableCell>
                <div className="max-w-xs truncate">{stock.expectedNotes}</div>
              </TableCell>
              <TableCell>{stock.resultDate}</TableCell>
              <TableCell>{stock.event || "-"}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant="outline"
                  size="sm"
                  className="mr-2"
                  onClick={() => setEditStockId(stock._id)}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteStock(stock._id)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
