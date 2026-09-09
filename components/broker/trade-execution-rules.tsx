"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import type { BrokerExecutionPreferences, BrokerRiskMode } from "@/lib/broker/broker-config"

type Props = {
  execution: BrokerExecutionPreferences
  disabled?: boolean
  onChange: (next: BrokerExecutionPreferences) => void
}

export function TradeExecutionRules({ execution, disabled, onChange }: Props) {
  return (
    <HudPanel>
      <HudPanelHeader
        title="Trade Execution Rules"
        description="Used later by the MT5 worker. Nothing is sent to XM until a worker is connected and execution is enabled."
      />
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="default-lot">Default Lot Size</Label>
          <Input
            id="default-lot"
            type="number"
            min={0.01}
            step={0.01}
            value={execution.defaultLot}
            disabled={disabled}
            onChange={(event) => onChange({ ...execution, defaultLot: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>Risk Mode</Label>
          <Select
            value={execution.riskMode}
            disabled={disabled}
            onValueChange={(value) => onChange({ ...execution, riskMode: value as BrokerRiskMode })}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fixed_lot">Fixed Lot</SelectItem>
              <SelectItem value="risk_percent">Risk Percentage</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between rounded-xl border border-cyan-400/15 px-4 py-3">
          <Label htmlFor="allow-buy">Allow Buy</Label>
          <Switch
            id="allow-buy"
            checked={execution.allowBuy}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...execution, allowBuy: checked })}
          />
        </div>
        <div className="flex items-center justify-between rounded-xl border border-cyan-400/15 px-4 py-3">
          <Label htmlFor="allow-sell">Allow Sell</Label>
          <Switch
            id="allow-sell"
            checked={execution.allowSell}
            disabled={disabled}
            onCheckedChange={(checked) => onChange({ ...execution, allowSell: checked })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="max-positions">Maximum Open Positions</Label>
          <Input
            id="max-positions"
            type="number"
            min={1}
            step={1}
            value={execution.maxOpenPositions}
            disabled={disabled}
            onChange={(event) => onChange({ ...execution, maxOpenPositions: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-sl">Default Stop Loss</Label>
          <Input
            id="default-sl"
            type="number"
            min={0}
            placeholder="Optional"
            value={execution.defaultStopLoss ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...execution,
                defaultStopLoss: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="default-tp">Default Take Profit</Label>
          <Input
            id="default-tp"
            type="number"
            min={0}
            placeholder="Optional"
            value={execution.defaultTakeProfit ?? ""}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...execution,
                defaultTakeProfit: event.target.value ? Number(event.target.value) : undefined,
              })
            }
          />
        </div>
      </div>
    </HudPanel>
  )
}
