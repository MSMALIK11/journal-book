"use client"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { coins } from "@/lib/symbols"

const tabTriggerClass = "data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200"

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
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="hud-label">Tools</p>
      <h1 className="text-xl font-semibold tracking-tight text-cyan-100">Pip & Risk Calculator</h1>

      <Tabs defaultValue="pip">
        <TabsList className="h-auto flex-wrap border border-cyan-400/20 bg-[#0b1016] p-1">
          <TabsTrigger value="pip" className={tabTriggerClass}>Pip Calculator</TabsTrigger>
          <TabsTrigger value="profit" className={tabTriggerClass}>Profit/Loss</TabsTrigger>
          <TabsTrigger value="lot" className={tabTriggerClass}>Lot Sizing</TabsTrigger>
        </TabsList>

        <TabsContent value="pip">
          <HudPanel className="mt-4 space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Symbol</Label>
                <select
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  className="w-full rounded-md border border-cyan-400/20 bg-transparent p-2 text-sm"
                >
                  {coins.map((coin) => (
                    <option key={coin.symbol} value={coin.symbol}>
                      {coin.symbol} ({coin.type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <Label>Lot Size</Label>
                <Input
                  type="number"
                  value={lotSize}
                  min={0.01}
                  step={0.01}
                  onChange={(e) => setLotSize(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>
            </div>

            <Button onClick={handlePipCalc}>Calculate Pip Value</Button>

            <div className="text-xl font-semibold text-cyan-100">
              Pip Value: <span className="text-emerald-400">{pipValue.toFixed(2)} USD</span>
            </div>
            {pipResult ? (
              <p className="text-sm text-muted-foreground">Calculated result: {pipResult.toFixed(2)}</p>
            ) : null}
          </HudPanel>
        </TabsContent>

        <TabsContent value="profit">
          <HudPanel className="mt-4 space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Entry Price</Label>
                <Input
                  type="number"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>

              <div className="space-y-2">
                <Label>Exit Price</Label>
                <Input
                  type="number"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>
            </div>

            <Button onClick={handleProfitLossCalc}>Calculate Profit/Loss</Button>

            <div className="text-xl font-semibold text-cyan-100">
              Result: <span className="text-cyan-300">{profitLoss.toFixed(2)} USD</span>
            </div>
          </HudPanel>
        </TabsContent>

        <TabsContent value="lot">
          <HudPanel className="mt-4 space-y-4 p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Account Size ($)</Label>
                <Input
                  type="number"
                  value={accountSize}
                  onChange={(e) => setAccountSize(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <Label>Risk %</Label>
                <Input
                  type="number"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>
              <div className="space-y-2">
                <Label>Stop Loss (pips)</Label>
                <Input
                  type="number"
                  value={stopLossPips}
                  onChange={(e) => setStopLossPips(Number(e.target.value))}
                  className="border-cyan-400/20 bg-transparent"
                />
              </div>
            </div>

            <Button onClick={handleLotRecommendation}>Calculate Lot Size</Button>

            <div className="text-xl font-semibold text-cyan-100">
              Recommended Lot: <span className="text-violet-300">{recommendedLot}</span>
            </div>
          </HudPanel>
        </TabsContent>
      </Tabs>
    </div>
  )
}
