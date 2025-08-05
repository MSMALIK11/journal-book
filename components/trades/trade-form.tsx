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
import {
  Input
} from "@/components/ui/input"
import {
  Textarea
} from "@/components/ui/textarea"
import {
  Button
} from "@/components/ui/button"
import {
  Label
} from "@/components/ui/label"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"

export  function TradeForm() {
  const [formData, setFormData] = useState({
    instrument: "",
    entry_date: "",
    exit_date: "",
    trade_type: "",
    order_type: "",
    entry_price: "",
    exit_price: "",
    quantity: "",
    stop_loss: "",
    target: "",
    strategy: "",
    emotion_tag: "",
    setup_notes: "",
    tags: [],
  })
  const [loading, setLoading] = useState(false)

  return (
    <Card className="w-full max-w-5xl mx-auto bg-background shadow-xl rounded-2xl p-6 border border-muted">
      <CardHeader>
        <CardTitle className="text-2xl font-semibold text-primary">Add New Trade</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="psychology">Psychology</TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <Label>Instrument</Label>
                <Input value={formData.instrument} onChange={(e) => setFormData({ ...formData, instrument: e.target.value })} />
              </div>
              <div>
                <Label>Order Type</Label>
                <Input value={formData.order_type} onChange={(e) => setFormData({ ...formData, order_type: e.target.value })} />
              </div>
              <div>
                <Label>Entry Date</Label>
                <Input type="datetime-local" value={formData.entry_date} onChange={(e) => setFormData({ ...formData, entry_date: e.target.value })} />
              </div>
              <div>
                <Label>Exit Date</Label>
                <Input type="datetime-local" value={formData.exit_date} onChange={(e) => setFormData({ ...formData, exit_date: e.target.value })} />
              </div>
              <div>
                <Label>Entry Price</Label>
                <Input value={formData.entry_price} onChange={(e) => setFormData({ ...formData, entry_price: e.target.value })} />
              </div>
              <div>
                <Label>Exit Price</Label>
                <Input value={formData.exit_price} onChange={(e) => setFormData({ ...formData, exit_price: e.target.value })} />
              </div>
              <div>
                <Label>Quantity</Label>
                <Input value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} />
              </div>
              <div>
                <Label>Stop Loss</Label>
                <Input value={formData.stop_loss} onChange={(e) => setFormData({ ...formData, stop_loss: e.target.value })} />
              </div>
              <div>
                <Label>Target</Label>
                <Input value={formData.target} onChange={(e) => setFormData({ ...formData, target: e.target.value })} />
              </div>
              <div>
                <Label>Strategy</Label>
                <Input value={formData.strategy} onChange={(e) => setFormData({ ...formData, strategy: e.target.value })} />
              </div>
              <div>
                <Label>Direction</Label>
                <ToggleGroup
                  type="single"
                  value={formData.trade_type}
                  onValueChange={(value) => setFormData({ ...formData, trade_type: value })}
                  className="flex gap-2 mt-1"
                >
                  <ToggleGroupItem value="Buy" className="px-4 py-2">📈 Long</ToggleGroupItem>
                  <ToggleGroupItem value="Sell" className="px-4 py-2">📉 Short</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div>
                <Label>Emotion Tag</Label>
                <Input value={formData.emotion_tag} onChange={(e) => setFormData({ ...formData, emotion_tag: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label>Setup Notes</Label>
                <Textarea value={formData.setup_notes} onChange={(e) => setFormData({ ...formData, setup_notes: e.target.value })} />
              </div>
            </div>

            <div className="flex justify-end gap-4 mt-8">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setFormData({
                    instrument: "",
                    entry_date: "",
                    exit_date: "",
                    trade_type: "",
                    order_type: "",
                    entry_price: "",
                    exit_price: "",
                    quantity: "",
                    stop_loss: "",
                    target: "",
                    strategy: "",
                    emotion_tag: "",
                    setup_notes: "",
                    tags: [],
                  })
                }}
              >
                Reset
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Add Trade"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="psychology">
            <p className="text-muted-foreground">Psychology section coming soon...</p>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
