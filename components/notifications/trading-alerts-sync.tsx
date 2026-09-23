"use client"

import { useCallback } from "react"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"

/**
 * Owns alert evaluation for the whole dashboard — SSE-driven refresh with a slow fallback when
 * the stream is down. Read-only consumers share the same SWR cache.
 */
export function TradingAlertsSync() {
  const { evaluate, refresh } = useTradingAlerts({ poll: true })

  const onSync = useCallback(
    (detail: { type?: string; imported?: number; updated?: number; accountId?: string }) => {
      if (detail.type === "alerts_updated") {
        void refresh()
        return
      }
      if (detail.type !== "trades_updated") return
      if (!(detail.imported || detail.updated)) return
      void evaluate(false)
    },
    [evaluate, refresh],
  )

  useTradeSyncEvent(onSync)
  return null
}
