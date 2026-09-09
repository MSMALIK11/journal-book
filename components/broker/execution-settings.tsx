"use client"

import { Switch } from "@/components/ui/switch"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"

type Props = {
  enabled: boolean
  canEnable: boolean
  disabled?: boolean
  onRequestEnable: () => void
  onDisable: () => void
}

export function ExecutionSettings({ enabled, canEnable, disabled, onRequestEnable, onDisable }: Props) {
  return (
    <HudPanel>
      <HudPanelHeader
        title="Automatic Trade Execution"
        description="Execute TradingView signals automatically through your connected MT5 account."
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex items-start justify-between gap-4 rounded-xl border border-cyan-400/15 bg-[#05070a]/50 px-4 py-3.5">
          <div>
            <p className="text-sm font-medium">Enable Automatic Execution</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {enabled
                ? "Eligible TradingView signals may be forwarded to the connected MT5 account."
                : "TradingView alerts will continue to be recorded in JournalBook but will not execute trades."}
            </p>
          </div>
          <Switch
            checked={enabled}
            disabled={disabled || (!enabled && !canEnable)}
            onCheckedChange={(checked) => {
              if (checked) onRequestEnable()
              else onDisable()
            }}
          />
        </div>
        {!canEnable ? (
          <p className="text-xs text-muted-foreground">
            Automatic execution stays off until Test Connection succeeds against a running MT5 worker.
          </p>
        ) : null}
      </div>
    </HudPanel>
  )
}
