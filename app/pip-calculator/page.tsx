// app/pip-calculator/page.tsx
"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { coins } from "@/lib/symbols"

export default function PipCalculatorPage() {
  const [symbol, setSymbol] = useState("EURUSD")
  const [lotSize, setLotSize] = useState(1)
  const [entryPrice, setEntryPrice] = useState(0)
  const [exitPrice, setExitPrice] = useState(0)
  const [accountSize, setAccountSize] = useState(1000)
  const [riskPercent, setRiskPercent] = useState(1)
  const [stopLossPips, setStopLossPips] = useState(20)
  const [pipValue, setPipValue] = useState(0)
  const [pipSize, setPipSize] = useState(10)
  const [pipResult, setPipResult] = useState(0)
  const [profitLoss, setProfitLoss] = useState(0)
  const [recommendedLot, setRecommendedLot] = useState(0)

  useEffect(() => {
    const found = coins.find((c) => c.symbol === symbol)
    if (found) {
      setPipSize(found.pipSize)
      setPipValue(found.pipValue * lotSize)
    }
  }, [symbol, lotSize])

  const handlePipCalc = () => {
    setPipResult(pipSize * lotSize * pipValue)
  }

  const handleProfitLossCalc = () => {
    const pipsGained = Math.abs(entryPrice - exitPrice) / pipSize
    const result = pipsGained * pipValue
    setProfitLoss(result)
  }

  const handleLotRecommendation = () => {
    const riskAmount = (riskPercent / 100) * accountSize
    const lot = riskAmount / (stopLossPips * pipValue)
    setRecommendedLot(parseFloat(lot.toFixed(2)))
  }

  return (
    <div className="max-w-4xl  p-6 space-y-6">
      <h1 className="text-3xl font-bold">Pip & Risk Calculator</h1>

      <Tabs defaultValue="pip">
        <TabsList>
          <TabsTrigger value="pip">Pip Calculator</TabsTrigger>
          <TabsTrigger value="profit">Profit/Loss</TabsTrigger>
          <TabsTrigger value="lot">Lot Sizing</TabsTrigger>
        </TabsList>

        <TabsContent value="pip">
          <Card className="mt-4">
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Symbol</Label>
                  <select
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    className="w-full border rounded p-2"
                  >
                    {coins.map((coin) => (
                      <option key={coin.symbol} value={coin.symbol}>
                        {coin.symbol} ({coin.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label>Lot Size</Label>
                  <Input
                    type="number"
                    value={lotSize}
                    min={0.01}
                    step={0.01}
                    onChange={(e) => setLotSize(Number(e.target.value))}
                  />
                </div>
              </div>

              <Button onClick={handlePipCalc}>Calculate Pip Value</Button>

              <div className="text-xl font-semibold">
                Pip Value: <span className="text-green-600">{pipValue.toFixed(2)} USD</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profit">
          <Card className="mt-4">
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Entry Price</Label>
                  <Input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(Number(e.target.value))}
                  />
                </div>

                <div>
                  <Label>Exit Price</Label>
                  <Input
                    type="number"
                    value={exitPrice}
                    onChange={(e) => setExitPrice(Number(e.target.value))}
                  />
                </div>
              </div>

              <Button onClick={handleProfitLossCalc}>Calculate Profit/Loss</Button>

              <div className="text-xl font-semibold">
                Result: <span className="text-blue-600">{profitLoss.toFixed(2)} USD</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lot">
          <Card className="mt-4">
            <CardContent className="p-6 space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Account Size ($)</Label>
                  <Input
                    type="number"
                    value={accountSize}
                    onChange={(e) => setAccountSize(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Risk %</Label>
                  <Input
                    type="number"
                    value={riskPercent}
                    onChange={(e) => setRiskPercent(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Stop Loss (pips)</Label>
                  <Input
                    type="number"
                    value={stopLossPips}
                    onChange={(e) => setStopLossPips(Number(e.target.value))}
                  />
                </div>
              </div>

              <Button onClick={handleLotRecommendation}>Calculate Lot Size</Button>

              <div className="text-xl font-semibold">
                 Recommended Lot: <span className="text-purple-600">{recommendedLot}</span>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
