"use client"

import { useEffect, useState } from "react"
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
import { ContrastIcon, Plus } from "lucide-react"
import { TradeFormData } from "@/app/types/trade"
import { useToast } from "@/hooks/use-toast"
import api from "@/services"
import { useQueryClient } from "@tanstack/react-query"
import { Instruments, Pair } from "@/app/types/instrumnts"
import { InstrumentsApiResponse } from "@/app/types/ApiResponse/instrumentsApiResponse"
interface TradeFormProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  onClose: () => void;
  initialData?: TradeFormData | null; // Optional, for update mode
}
const CONTRACT_SIZES = [
  // Forex
  { symbol: "EUR/USD", size: 100000, category: "Forex" },
  { symbol: "GBP/USD", size: 100000, category: "Forex" },
  { symbol: "USD/JPY", size: 100000, category: "Forex" },
  { symbol: "AUD/USD", size: 100000, category: "Forex" },
  { symbol: "USD/CAD", size: 100000, category: "Forex" },
  { symbol: "USD/CHF", size: 100000, category: "Forex" },

  // Metals
  { symbol: "XAUUSD", size: 100, category: "Metal" },   // 100 ounces
  { symbol: "XAGUSD", size: 5000, category: "Metal" },  // 5000 ounces

  // Crypto
  { symbol: "BTCUSD", size: 1, category: "Crypto" },    // 1 Bitcoin
  { symbol: "ETHUSD", size: 1, category: "Crypto" },    // 1 Ether
  { symbol: "LTCUSD", size: 1, category: "Crypto" },    // 1 Litecoin
  { symbol: "XRPUSD", size: 1000, category: "Crypto" }, // 1000 Ripple
];


export function TradeForm({ open, setOpen, initialData,onClose }: TradeFormProps) {
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
  const [instrumentList, setInstrumentList] = useState<InstrumentsApiResponse>([])
  const [newInstrument, setNewInstrument] = useState("")
  const [showAddInstrument, setShowAddInstrument] = useState(false)
  const [strategies,setStrategies]=useState(["Breakout", "Reversal", "5 EMA","MACD"])
  const[contractSize,setContractSize]=useState(100)
  const [category,setNewCategory]=useState<string>("")
  const [savingpair,setSavingPair]=useState(false)
  const { toast } = useToast()
 const queryClient=useQueryClient()
  const resetForm = () => {
    setFormData({
      category: "",
      instrument: "XAUUSD",
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

   useEffect(() => {
  resetForm();
    if (initialData) {
      setFormData({
        ...initialData
      });
    } else {
      resetForm();
    }
  }, [initialData]);

  const handleAddInstrument =async (paylaod:Instruments) => {
    try {
    
      const res=await  api.instrumnts.addInstruments(paylaod)
      console.log('response a',res)
      setInstrumentList(res.data)
      
    } catch (error) {
      console.error(error)
      
    }
  }
  
// Add this useEffect inside your component, after state definitions

useEffect(() => {
  console.log('calculating...');
  fetchInstruments()
  if (formData.instrument) {
    const entry = parseFloat(formData.entry_price);
    const exit = parseFloat(formData.exit_price);
    const qty = parseFloat(formData.quantity);  // usually in lots
 

    console.log('entry', entry, 'exit', exit, 'qty', qty, 'contractSize', contractSize);

    if (!isNaN(entry) && !isNaN(exit) && !isNaN(qty) && !isNaN(contractSize)) {
      const pnl = (exit - entry) * qty * contractSize;
      console.log('pnl', pnl);

      setFormData(prev => ({
        ...prev,
        net_pnl: pnl.toFixed(2) // keep 2 decimal places
      }));
    }
  }
}, [
  formData.entry_price,
  formData.exit_price,
  formData.quantity,
  formData.instrument
]);
const fetchInstruments= async()=>{
try {
  const res=await api.instrumnts.getInstruments()
  setInstrumentList(res.data)
  
} catch (error) {
  
}

}



   const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
console.log('form data ',formData)
    try {
      if (initialData && initialData?.id) {
        // UPDATE existing trade
        const res = await api.trade.update(initialData?.id, formData);
        // if (!res || res.error) throw new Error(res?.error || "Failed to update trade");

        toast({ title: "Success", description: "Trade updated successfully!" });
      } else {
        // ADD new trade
        const res = await api.trade.add(formData);
        // if (!res || res.error) throw new Error(res?.error || "Failed to add trade");

        toast({ title: "Success", description: "Trade added successfully!" });
      }

   queryClient.invalidateQueries({ queryKey: ['user-trade-history'] })
      resetForm();
      setOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

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
      <Dialog open={open}   onOpenChange={(isOpen) => {
        console.log("Dialog open state changed:", isOpen);
    setOpen(isOpen);
    if (!isOpen) {
      onClose();
    }
     
  }}>
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
  console.log('value',value)
  if (value === "__add_new") {
    setShowAddInstrument(true);
  } else {
   const selectedInstrument = instrumentList
  ?.flatMap((cat) => cat.instruments)
  .find((p) => p.symbol === value);
if (selectedInstrument) {
  setContractSize(selectedInstrument.size);
  setFormData({
    ...formData,
    instrument: selectedInstrument.symbol,
  });
}
  }
}}

>
  <SelectTrigger>
    <SelectValue placeholder="Select instrument" />
  </SelectTrigger>
  <SelectContent>
    {instrumentList?.map((item: any) => (
      <div key={item._id}>
        {/* Category Heading */}
        <div className="px-2 py-1 text-sm font-semibold text-gray-500">
          {item.category}
        </div>
        {/* Symbols under this category */}
        {item.instruments.map((pair: any) => (
          <SelectItem key={pair._id} value={pair.symbol}>
            {pair.symbol}
          </SelectItem>
        ))}
      </div>
    ))}

    {/* Add New */}
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
                  {loading ? "Saving..." :initialData?.id?"Update": "Add Trade"}
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
    {/* Add Instrument Dialog */}
<Dialog open={showAddInstrument} onOpenChange={setShowAddInstrument}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Add New Instrument</DialogTitle>
    </DialogHeader>

    {/* Category */}
    <Select value={category} onValueChange={(val:string)=>setNewCategory(val)}>
      <SelectTrigger>
        <SelectValue placeholder="Select Category" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Forex">Forex</SelectItem>
        <SelectItem value="Metals">Metals</SelectItem>
        <SelectItem value="Crypto">Crypto</SelectItem>
      </SelectContent>
    </Select>

    {/* Symbol */}
    <Input
      placeholder="Enter instrument symbol (e.g. EUR/USD, XAUUSD)"
      value={newInstrument}
      onChange={(e) => setNewInstrument(e.target.value)}
      className="mt-3"
    />

    {/* Contract Size */}
    <Input
      placeholder="Enter contract size (e.g. 100000)"
      type="number"
      value={contractSize}
      onChange={(e) => setContractSize(Number(e.target.value))}
      className="mt-3"
    />

    {/* Actions */}
    <div className="flex justify-end gap-2 mt-4">
      <Button variant="secondary" onClick={() => setShowAddInstrument(false)}>
        Cancel
      </Button>
      <Button
        onClick={() => {
          const payload = {
            category: category,
            symbol: newInstrument,
            size: contractSize,
           
          };
          handleAddInstrument(payload);
        }}
      >
        Save
      </Button>
    </div>
  </DialogContent>
</Dialog>

    </div>
  )
}
