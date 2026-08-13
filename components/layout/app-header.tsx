"use client"

import { NotificationBell } from "@/components/notifications/notification-bell"
import { TradingMomentBell } from "@/components/notifications/trading-moment-bell"
import { SessionTimeline } from "@/components/notifications/session-timeline"
import { ThemeToggle } from "@/components/theme-toggle"
import { HudClock } from "@/components/layout/hud-clock"
import { LiveBadge } from "@/components/layout/live-status"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"

export function AppHeader() {
  const { zones, isLoading } = useTradingAlerts()

  return (
    <header className="fixed right-0 top-0 z-30 flex h-14 items-center justify-end gap-3 border-b border-cyan-400/15 bg-[#05070a]/85 px-4 pl-14 backdrop-blur lg:left-64 lg:pl-5">
      <div className="flex items-center gap-2 [&_button]:border-cyan-400/20 [&_button]:bg-transparent">
        <HudClock />
        <LiveBadge />
        {!isLoading && zones ? (
          <SessionTimeline zones={zones} compact activeOnly className="mr-1 hidden sm:flex" />
        ) : null}
        <TradingMomentBell />
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  )
}
