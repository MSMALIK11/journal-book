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

// The instant paths are the extension DOM event and SSE; this poll only covers
// events those miss (e.g. SSE landing on another Next.js worker). So it backs
// right off while SSE is healthy instead of hammering the DB every few hundred ms.
const POLL_SSE_UP_MS = 15_000
const POLL_SSE_DOWN_MS = 2_000
const POLL_HIDDEN_MS = 30_000
// On mount the stored event is history, so anything older than this is used only
// as a baseline — otherwise every page load replays the last trade's alarm.
const STALE_EVENT_MS = 2 * 60_000

/** SSE + extension DOM event + DB poll backup — reliable UI refresh after TV sync. */
function logicalSyncKey(detail: TradeSyncEventDetail) {
  const tradeId = detail.latestTrade?.id || ""
  const entry = detail.latestTrade?.entry_date || ""
  const phase = detail.latestTrade?.is_open === false ? "closed" : "open"
  return `${detail.accountId || ""}:${tradeId}:${entry}:${detail.imported ?? 0}:${detail.updated ?? 0}:${phase}`
}

export function useTradeSyncListener({ enabled = true, onEvent, onConnectionChange }: Options) {
  const onEventRef = useRef(onEvent)
  const onConnectionChangeRef = useRef(onConnectionChange)
  const lastEventIdRef = useRef<string | null>(null)
  const lastLogicalKeyRef = useRef<string | null>(null)
  const lastServerEventIdRef = useRef<string | null>(null)

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

    const key = logicalSyncKey(detail)
    if (key === lastLogicalKeyRef.current) {
      if (detail.eventId) lastEventIdRef.current = detail.eventId
      return
    }

    if (detail.eventId) lastEventIdRef.current = detail.eventId
    lastLogicalKeyRef.current = key

    const imported = detail.imported ?? 0
    const updated = detail.updated ?? 0
    if (detail.type === "trades_updated" && !(imported || updated)) return

    onEventRef.current(detail)
  }, [])

  useEffect(() => {
    if (!enabled) return

    let es: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    let sseUp = false
    let primed = false

    function onDomSync(event: Event) {
      const detail = (event as CustomEvent<TradeSyncEventDetail>).detail
      if (!detail) return
      handleEvent({
        type: "trades_updated",
        ...detail,
        eventId:
          detail.eventId ||
          `dom-${detail.accountId || "acc"}-${detail.latestTrade?.id || "none"}-${detail.imported ?? 0}-${detail.updated ?? 0}`,
      })
    }

    document.addEventListener("jb-trades-synced", onDomSync)

    async function pollLastEvent() {
      try {
        const response = await authFetch("/api/sync/last-event")
        const data = await response.json()
        if (!response.ok || !data.event?.eventId) return

        const serverEventId = String(data.event.eventId)
        if (serverEventId === lastServerEventIdRef.current) return
        if (serverEventId === lastEventIdRef.current) {
          lastServerEventIdRef.current = serverEventId
          return
        }

        const alreadyHadLiveEvent = Boolean(lastEventIdRef.current)
        const wasPrimed = primed
        primed = true
        lastServerEventIdRef.current = serverEventId

        if (!wasPrimed) {
          const ageMs = data.event.at ? Date.now() - new Date(data.event.at).getTime() : 0
          lastLogicalKeyRef.current =
            lastLogicalKeyRef.current || logicalSyncKey({ type: "trades_updated", ...data.event })
          if (!lastEventIdRef.current) lastEventIdRef.current = serverEventId
          // History, or DOM/SSE already delivered this fill — do not replay the alarm.
          if (alreadyHadLiveEvent || ageMs > STALE_EVENT_MS) return
        }

        handleEvent({ type: "trades_updated", ...data.event })
      } catch {
        // silent — SSE or next poll retries
      }
    }

    function nextPollDelay() {
      if (document.visibilityState === "hidden") return POLL_HIDDEN_MS
      return sseUp ? POLL_SSE_UP_MS : POLL_SSE_DOWN_MS
    }

    function schedulePoll() {
      if (stopped) return
      if (pollTimer) clearTimeout(pollTimer)
      pollTimer = setTimeout(async () => {
        await pollLastEvent()
        schedulePoll()
      }, nextPollDelay())
    }

    function onVisibilityChange() {
      if (document.visibilityState !== "visible") return
      // Catch up on anything missed while the tab was backgrounded.
      void pollLastEvent()
      schedulePoll()
    }

    function connectSse() {
      es = new EventSource("/api/sync/events")

      es.onmessage = (message) => {
        try {
          const data = JSON.parse(message.data) as TradeSyncEventDetail & { type?: string }
          if (data.type === "connected") {
            sseUp = true
            onConnectionChangeRef.current?.(true)
            schedulePoll()
            return
          }
          if (data.type === "accounts_updated") {
            handleEvent(data)
            return
          }
          if (data.type !== "trades_updated") return
          handleEvent({
            ...data,
            eventId: data.eventId || `sse-${data.accountId}-${data.imported}-${data.updated}-${data.latestTrade?.id || "none"}`,
          })
        } catch {
          // ignore malformed events
        }
      }

      es.onerror = () => {
        sseUp = false
        onConnectionChangeRef.current?.(false)
        es?.close()
        // SSE is the primary channel — poll faster until it is back.
        schedulePoll()
        reconnectTimer = setTimeout(connectSse, 5000)
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    connectSse()
    void pollLastEvent()
    schedulePoll()

    return () => {
      stopped = true
      document.removeEventListener("jb-trades-synced", onDomSync)
      document.removeEventListener("visibilitychange", onVisibilityChange)
      es?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [enabled, handleEvent])
}
