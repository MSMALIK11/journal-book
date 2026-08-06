"use client"

import { Settings2 } from "lucide-react"
import { AccountsSettings } from "@/components/settings/accounts-settings"
import { AlertSettings } from "@/components/settings/alert-settings"
import { LiveSyncSettings } from "@/components/settings/live-sync-settings"
import { AutoExportSettings } from "@/components/settings/auto-export-settings"
import { TradeAlarmSettings } from "@/components/settings/trade-alarm-settings"

export function SettingsPageContent() {
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-8">
      <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-muted/40 via-card to-card px-6 py-6 shadow-sm">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/5 blur-2xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Settings2 className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Settings</h1>
            <p className="mt-1.5 max-w-xl text-sm text-muted-foreground leading-relaxed">
              Expand a section to configure accounts, alerts, trade alarms, and live sync. Changes save
              automatically.
            </p>
          </div>
        </div>
      </header>

      <div className="space-y-3">
        <AccountsSettings />
        <TradeAlarmSettings />
        <AlertSettings />
        <LiveSyncSettings />
        <AutoExportSettings />
      </div>
    </div>
  )
}
