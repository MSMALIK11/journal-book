"use client"

import { useEffect } from "react"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"
import { setPwaAppBadge } from "@/lib/pwa/app-badge"

/** Mirrors unread alert count onto the installed PWA icon when supported. */
export function AppBadgeSync() {
  const { unreadCount } = useTradingAlerts()

  useEffect(() => {
    setPwaAppBadge(unreadCount)
  }, [unreadCount])

  return null
}
