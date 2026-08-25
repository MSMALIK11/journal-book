"use client"

import { Settings2 } from "lucide-react"
import { AccountsSettings } from "@/components/settings/accounts-settings"
import { AlertSettings } from "@/components/settings/alert-settings"
import { LiveSyncSettings } from "@/components/settings/live-sync-settings"
import { AutoExportSettings } from "@/components/settings/auto-export-settings"
import { TradeAlarmSettings } from "@/components/settings/trade-alarm-settings"
import { TelegramSettings } from "@/components/settings/telegram-settings"
import { HudPanel } from "@/components/dashboard/hud-panel"

export function SettingsPageContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <HudPanel className="px-6 py-5">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-500/10 text-cyan-300">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <p className="hud-label">System</p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-cyan-100">Settings</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground leading-relaxed">
              Expand a section to configure accounts, alerts, and live sync. Changes save automatically.
            </p>
          </div>
        </div>
      </HudPanel>

      <div className="space-y-3">
        <AccountsSettings />
        <TradeAlarmSettings />
        <TelegramSettings />
        <AlertSettings />
        <LiveSyncSettings />
        <AutoExportSettings />
      </div>
    </div>
  )
}
