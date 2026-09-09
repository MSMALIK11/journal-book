"use client"

import { Cable, Settings2 } from "lucide-react"
import Link from "next/link"
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
        <Link
          href="/settings/broker"
          className="hud-panel flex items-start gap-4 px-5 py-4 transition-colors hover:bg-cyan-400/5"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300 ring-1 ring-inset ring-cyan-500/20">
            <Cable className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold tracking-tight">Broker & MT5</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Connect XM MetaTrader 5 and configure automatic execution rules.
            </p>
          </div>
        </Link>
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
