import { ReactNode } from "react"
import { ActiveAccountProvider } from "@/hooks/use-active-account"
import { SyncAccountAutoSwitch } from "@/components/sync/sync-account-auto-switch"
import { AutoExportScheduler } from "@/components/export/auto-export-scheduler"
import { NewTradeAlarmProvider } from "@/components/notifications/new-trade-alarm-provider"
import { TradingAlertsSync } from "@/components/notifications/trading-alerts-sync"
import { TradeSyncProvider } from "@/hooks/use-trade-sync-event"
import { AppHeader } from "@/components/layout/app-header"
import { Sidebar } from "./sidebar"

interface SiteLayoutProps {
  children: ReactNode
}

export default function SideLayout({ children }: SiteLayoutProps) {
  return (
    <ActiveAccountProvider>
      <TradeSyncProvider>
        <NewTradeAlarmProvider>
          <TradingAlertsSync />
          <SyncAccountAutoSwitch />
          <AutoExportScheduler />
          <div className="flex min-h-screen w-full">
            <div className="hidden w-64 shrink-0 lg:block" aria-hidden />
            <Sidebar />
            <AppHeader />

            <main className="min-w-0 flex-1 overflow-auto px-4 pb-8 pt-20 sm:px-5 lg:px-6 lg:pb-10 lg:pt-16">
              {children}
            </main>
          </div>
        </NewTradeAlarmProvider>
      </TradeSyncProvider>
    </ActiveAccountProvider>
  )
}
