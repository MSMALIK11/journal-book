"use client"

import { useCallback, useEffect, useRef } from "react"
import { authFetch } from "@/lib/client-auth"

import type { ImportedTradeSnapshot } from "@/lib/sync-events"

export type TradeSyncEventDetail = {
  type?: string
  eventId?: string
  accountId?: string
  accountName?: string
  imported?: number
  updated?: number
  skipped?: number
  latestTrade?: ImportedTradeSnapshot
  created?: { id: string; name: string }[]
  primaryAccountId?: string
}

type Options = {
  enabled?: boolean
  onEvent: (detail: TradeSyncEventDetail) => void
  onConnectionChange?: (connected: boolean) => void
}

const POLL_MS = 3_000

/** SSE + extension DOM event + DB poll backup — reliable UI refresh after TV sync. */
export function useTradeSyncListener({ enabled = true, onEvent, onConnectionChange }: Options) {
  const onEventRef = useRef(onEvent)
  const onConnectionChangeRef = useRef(onConnectionChange)
  const lastEventIdRef = useRef<string | null>(null)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    onConnectionChangeRef.current = onConnectionChange
  }, [onConnectionChange])

  const handleEvent = useCallback((detail: TradeSyncEventDetail) => {
    if (detail.type === "accounts_updated") {
      onEventRef.current(detail)
      return
    }

    if (detail.eventId && detail.eventId === lastEventIdRef.current) return
    if (detail.eventId) lastEventIdRef.current = detail.eventId

    const imported = detail.imported ?? 0
    const updated = detail.updated ?? 0
    if (detail.type === "trades_updated" && !(imported || updated)) return

    onEventRef.current(detail)
  }, [])

  useEffect(() => {
    if (!enabled) return

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setInterval> | null = null

    function onDomSync(event: Event) {
      const detail = (event as CustomEvent<TradeSyncEventDetail>).detail
      if (!detail) return
      handleEvent({
        type: "trades_updated",
        eventId: detail.eventId || `dom-${Date.now()}`,
        ...detail,
      })
    }

    document.addEventListener("jb-trades-synced", onDomSync)

    async function pollLastEvent() {
      try {
        const response = await authFetch("/api/sync/last-event")
        const data = await response.json()
        if (!response.ok || !data.event?.eventId) return
        if (data.event.eventId === lastEventIdRef.current) return
        handleEvent({ type: "trades_updated", ...data.event })
      } catch {
        // silent — SSE or next poll retries
      }
    }

    function connectSse() {
      es = new EventSource("/api/sync/events")

      es.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as TradeSyncEventDetail & { type?: string }
          if (data.type === "connected") {
            onConnectionChangeRef.current?.(true)
            return
          }
          if (data.type === "accounts_updated") {
            handleEvent(data)
            return
          }
          if (data.type !== "trades_updated") return
          handleEvent({
            ...data,
            eventId: data.eventId || `sse-${Date.now()}-${data.accountId}-${data.imported}-${data.updated}`,
          })
        } catch {
          // ignore malformed events
        }
      }

      es.onerror = () => {
        onConnectionChangeRef.current?.(false)
        es?.close()
        reconnectTimer = setTimeout(connectSse, 5000)
      }
    }

    connectSse()
    void pollLastEvent()
    pollTimer = setInterval(() => {
      void pollLastEvent()
    }, POLL_MS)

    return () => {
      document.removeEventListener("jb-trades-synced", onDomSync)
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollTimer) clearInterval(pollTimer)
    }
  }, [enabled, handleEvent])
}
