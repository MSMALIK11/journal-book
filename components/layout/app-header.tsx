"use client"

import { NotificationBell } from "@/components/notifications/notification-bell"
import { SessionTimeline } from "@/components/notifications/session-timeline"
import { ThemeToggle } from "@/components/theme-toggle"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"

export function AppHeader() {
  const { zones, isLoading } = useTradingAlerts()

  return (
    <header className="fixed right-0 top-0 z-30 flex h-14 items-center justify-end gap-2 px-4 lg:left-64">
      {!isLoading && zones ? (
        <SessionTimeline zones={zones} compact activeOnly className="hidden sm:flex mr-1" />
      ) : null}
      <NotificationBell />
      <ThemeToggle />
    </header>
  )
}
