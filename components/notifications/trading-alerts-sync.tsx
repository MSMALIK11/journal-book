"use client"

import { useCallback } from "react"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"

/** Re-evaluate header alerts when trades sync — does not touch the trade alarm modal. */
export function TradingAlertsSync() {
  const { evaluate } = useTradingAlerts()

  const onSync = useCallback(
    (detail: { type?: string; imported?: number; updated?: number }) => {
      if (detail.type !== "trades_updated") return
      if (!(detail.imported || detail.updated)) return
      void evaluate(false)
    },
    [evaluate],
  )

  useTradeSyncEvent(onSync)
  return null
}
