"use client"

import { useCallback, useEffect, useRef } from "react"
import { authFetch } from "@/lib/client-auth"

import type { ImportedTradeSnapshot } from "@/lib/sync-events"

export type TradeSyncEventDetail = {
  type?: string
  eventId?: string
  kind?: "open" | "close"
  at?: string
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
  const phase = detail.kind || (detail.latestTrade?.is_open === false ? "closed" : "open")
  return `${detail.accountId || ""}:${tradeId}:${entry}:${detail.imported ?? 0}:${detail.updated ?? 0}:${phase}`
}

function asEventList(data: { event?: TradeSyncEventDetail; events?: TradeSyncEventDetail[] }) {
  if (Array.isArray(data.events) && data.events.length) {
    return data.events.filter((event) => event?.eventId)
  }
  return data.event?.eventId ? [data.event] : []
}

export function useTradeSyncListener({ enabled = true, onEvent, onConnectionChange }: Options) {
  const onEventRef = useRef(onEvent)
  const onConnectionChangeRef = useRef(onConnectionChange)
  const lastEventIdRef = useRef<string | null>(null)
  const seenEventIdsRef = useRef<Set<string>>(new Set())
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

    if (detail.eventId && (detail.eventId === lastEventIdRef.current || seenEventIdsRef.current.has(detail.eventId))) {
      return
    }

    const key = logicalSyncKey(detail)
    if (key === lastLogicalKeyRef.current) {
      if (detail.eventId) {
        lastEventIdRef.current = detail.eventId
        seenEventIdsRef.current.add(detail.eventId)
      }
      return
    }

    if (detail.eventId) {
      lastEventIdRef.current = detail.eventId
      seenEventIdsRef.current.add(detail.eventId)
    }
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
        if (!response.ok) return
        const events = asEventList(data)
        if (!events.length) return

        const newest = events[events.length - 1]
        const serverEventId = String(newest.eventId)
        if (serverEventId === lastServerEventIdRef.current) return
        if (serverEventId === lastEventIdRef.current || seenEventIdsRef.current.has(serverEventId)) {
          lastServerEventIdRef.current = serverEventId
          for (const event of events) {
            if (event.eventId) seenEventIdsRef.current.add(String(event.eventId))
          }
          return
        }

        const alreadyHadLiveEvent = Boolean(lastEventIdRef.current)
        const wasPrimed = primed
        primed = true
        lastServerEventIdRef.current = serverEventId

        if (!wasPrimed) {
          lastLogicalKeyRef.current =
            lastLogicalKeyRef.current || logicalSyncKey({ type: "trades_updated", ...newest })
          if (!lastEventIdRef.current) lastEventIdRef.current = serverEventId
          for (const event of events) {
            if (event.eventId) seenEventIdsRef.current.add(String(event.eventId))
          }
          // History, or DOM/SSE already delivered this fill — do not replay the alarm.
          if (alreadyHadLiveEvent) return
          for (const event of events) {
            const ageMs = event.at ? Date.now() - new Date(event.at).getTime() : 0
            if (ageMs > STALE_EVENT_MS) continue
            seenEventIdsRef.current.delete(String(event.eventId))
            handleEvent({ type: "trades_updated", ...event })
          }
          return
        }

        for (const event of events) {
          handleEvent({ type: "trades_updated", ...event })
        }
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
