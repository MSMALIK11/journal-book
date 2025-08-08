"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select"
import { Plus } from "lucide-react"
import { TradeFormData } from "@/app/types/trade"
import { useToast } from "@/hooks/use-toast"
import api from "@/services"
import { useQueryClient } from "@tanstack/react-query"
export function TradeForm({ open, setOpen }: { open: boolean, setOpen: (open: boolean) => void }) {
  const [formData, setFormData] = useState<TradeFormData>({
    category: "",
    instrument: "",
    entry_date: "",
    exit_date: "",
    trade_type: "",
    entry_price: "",
    exit_price: "",
    quantity: "",
    stop_loss: "",
    target: "",
    strategy: "",
    emotion_tag: "",
    setup_notes: "",
    tags: [],
    net_pnl:"0",
  })
  const [loading, setLoading] = useState(false)
  const [instrumentList, setInstrumentList] = useState(["NIFTY", "BANKNIFTY", "EUR/USD"])
  const [newInstrument, setNewInstrument] = useState("")
  const [showAddInstrument, setShowAddInstrument] = useState(false)
  const [strategies,setStrategies]=useState(["Breakout", "Reversal", "5 EMA","MACD"])
  const { toast } = useToast()
 const queryClient=useQueryClient()
  const resetForm = () => {
    setFormData({
      category: "",
      instrument: "",
      entry_date: "",
      exit_date: "",
      trade_type: "",
      entry_price: "",
      exit_price: "",
      quantity: "",
      stop_loss: "",
      target: "",
      strategy: "",
      emotion_tag: "",
      setup_notes: "",
      tags: [],
      net_pnl:'0'
    })
  }

  const handleAddInstrument = () => {
    if (newInstrument.trim() && !instrumentList.includes(newInstrument)) {
      setInstrumentList([...instrumentList, newInstrument])
      setFormData({ ...formData, instrument: newInstrument })
    }
    setNewInstrument("")
    setShowAddInstrument(false)
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res=await api.trade.add(formData)
      console.log('res',res)
      if (res.status !== 201) {
        throw new Error("Failed to add trade")
      }
   toast({
        title: "Success",
        description: "Trade Added successfully!",
      })
  queryClient.invalidateQueries({ queryKey: ['user-trade-history'] })
      resetForm()
      setOpen(false)

    } catch (error:any) {
      console.error("Error adding trade:", error)
        toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative">
      {/* Floating Add Button */}
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 rounded-full w-14 h-14 shadow-lg"
      >
        <Plus className="w-6 h-6" />
      </Button>

      {/* Add Trade Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="lg:min-w-4xl max-w-7xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold text-primary">
              Add New Trade
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="general" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="psychology">Psychology</TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <div className="grid md:grid-cols-3 gap-6">

                {/* Trade Category */}
                <div>
                  <Label>Trade Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Forex">Forex</SelectItem>
                      <SelectItem value="Indian">Indian</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Instrument Dropdown */}
                <div>
                  <Label>Instrument</Label>
                  <Select
                    value={formData.instrument}
                    onValueChange={(value) => {
                      if (value === "__add_new") {
                        setShowAddInstrument(true)
                      } else {
                        setFormData({ ...formData, instrument: value })
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select instrument" />
                    </SelectTrigger>
                    <SelectContent>
                      {instrumentList.map((inst, idx) => (
                        <SelectItem key={idx} value={inst}>
                          {inst}
                        </SelectItem>
                      ))}
                      <SelectItem value="__add_new" className="text-blue-600">
                        ➕ Add New Instrument
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Entry & Exit Price */}
                <div>
                  <Label>Entry Price</Label>
                  <Input
                    value={formData.entry_price}
                    onChange={(e) =>
                      setFormData({ ...formData, entry_price: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Exit Price</Label>
                  <Input
                    value={formData.exit_price}
                    onChange={(e) =>
                      setFormData({ ...formData, exit_price: e.target.value })
                    }
                  />
                </div>
{/* Entry Date & Time */}
<div>
  <Label>Entry Date & Time</Label>
  <Input
    type="datetime-local"
    value={formData.entry_date}
    onChange={(e) =>
      setFormData({ ...formData, entry_date: e.target.value })
    }
  />
</div>

{/* Exit Date & Time */}
<div>
  <Label>Exit Date & Time</Label>
  <Input
    type="datetime-local"
    value={formData.exit_date}
    onChange={(e) =>
      setFormData({ ...formData, exit_date: e.target.value })
    }
  />
</div>

                {/* Quantity */}
                <div>
                  <Label>Quantity</Label>
                  <Input
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({ ...formData, quantity: e.target.value })
                    }
                  />
                </div>

                {/* Stop Loss */}
                <div>
                  <Label>Stop Loss</Label>
                  <Input
                    value={formData.stop_loss}
                    onChange={(e) =>
                      setFormData({ ...formData, stop_loss: e.target.value })
                    }
                  />
                </div>

                {/* Target */}
                <div>
                  <Label>Target</Label>
                  <Input
                    value={formData.target}
                    onChange={(e) =>
                      setFormData({ ...formData, target: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>P&L</Label>
                  <Input
                      placeholder="Enter profit (+) or loss (-)"
                    value={formData.net_pnl }
                    onChange={(e) =>
                      setFormData({ ...formData, net_pnl :e.target.value })
                    }
                  />
                </div>

                {/* Strategy */}
                <div>
                  <Label>Strategy</Label>
                  {/* <Input
                    value={formData.strategy}
                    onChange={(e) =>
                      setFormData({ ...formData, strategy: e.target.value })
                    }
                  />
                     <Label>Instrument</Label> */}
                  <Select
                    value={formData.strategy}
                    onValueChange={(value) => {
                     setFormData({ ...formData, strategy: value })
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Strategy" />
                    </SelectTrigger>
                    <SelectContent>
                      {strategies.map((inst, idx) => (
                        <SelectItem key={idx} value={inst}>
                          {inst}
                        </SelectItem>
                      ))}

                    </SelectContent>
                  </Select>
                </div>

                {/* Direction */}
                <div>
                  <Label>Direction</Label>
                  <ToggleGroup
                    type="single"
                    value={formData.trade_type}
                    onValueChange={(value) =>
                      setFormData({ ...formData, trade_type: value })
                    }
                    className="flex gap-2 mt-1"
                  >
                    <ToggleGroupItem value="Buy" className="px-4 py-2">
                      📈 Long
                    </ToggleGroupItem>
                    <ToggleGroupItem value="Sell" className="px-4 py-2">
                      📉 Short
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                {/* Emotion Tag */}
                <div>
                  <Label>Emotion Tag</Label>
                  <Input
                    value={formData.emotion_tag}
                    onChange={(e) =>
                      setFormData({ ...formData, emotion_tag: e.target.value })
                    }
                  />
                </div>

                {/* Notes */}
                <div className="col-span-2">
                  <Label>Setup Notes</Label>
                  <Textarea
                    value={formData.setup_notes}
                    onChange={(e) =>
                      setFormData({ ...formData, setup_notes: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-4 mt-8">
                <Button type="button" variant="secondary" onClick={resetForm}>
                  Reset
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading ? "Saving..." : "Add Trade"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="psychology">
              <p className="text-muted-foreground">
                Psychology section coming soon...
              </p>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Instrument Dialog */}
      <Dialog open={showAddInstrument} onOpenChange={setShowAddInstrument}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Instrument</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Enter new instrument name"
            value={newInstrument}
            onChange={(e) => setNewInstrument(e.target.value)}
          />
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="secondary" onClick={() => setShowAddInstrument(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddInstrument}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
