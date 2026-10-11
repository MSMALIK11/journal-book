"use client"

import { useEffect, useState } from "react"
import { NotificationBell } from "@/components/notifications/notification-bell"
import { TradingMomentBell } from "@/components/notifications/trading-moment-bell"
import { SessionTimeline } from "@/components/notifications/session-timeline"
import { HeaderUserPersona } from "@/components/layout/header-user-persona"
import { HudClock } from "@/components/layout/hud-clock"
import { LiveBadge } from "@/components/layout/live-status"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"
import { isStandalonePwa } from "@/lib/pwa/client"

export function AppHeader() {
  const { zones, isLoading } = useTradingAlerts()
  const [standalone, setStandalone] = useState(false)

  useEffect(() => {
    setStandalone(isStandalonePwa())
  }, [])

  return (
    <header className="fixed right-0 top-0 z-30 flex h-14 items-center justify-end gap-2 border-b border-cyan-400/15 bg-[#05070a]/85 px-4 pl-14 backdrop-blur lg:left-64 lg:pl-5 [&_button]:border-cyan-400/20 [&_button]:bg-transparent">
      {!standalone ? <HudClock /> : null}
      <LiveBadge />
      {!standalone && !isLoading && zones ? (
        <SessionTimeline zones={zones} compact activeOnly className="mr-1 hidden sm:flex" />
      ) : null}
      <TradingMomentBell />
      <NotificationBell />
      <HeaderUserPersona className="ml-1 min-w-0 max-w-[min(220px,42vw)] sm:max-w-xs" />
    </header>
  )
}
