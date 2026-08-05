"use client"

import { useCallback, useEffect, useRef } from "react"
import { authFetch } from "@/lib/client-auth"
import { requestExtensionSync } from "@/lib/client-extension-sync"

type Options = {
  enabled: boolean
  pollSeconds: number
  onComplete?: () => void
}

export function useLiveSyncAutoRefresh({ enabled, pollSeconds, onComplete }: Options) {
  const inFlightRef = useRef(false)
  const pollSecondsRef = useRef(pollSeconds)
  const mountedRef = useRef(false)

  useEffect(() => {
    pollSecondsRef.current = pollSeconds
  }, [pollSeconds])

  const runSync = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await requestExtensionSync({
        queueRefresh: async () => {
          const response = await authFetch("/api/sync/request-refresh", { method: "POST" })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) throw new Error(data.error || "Could not queue sync")
          return new Date(data.at || Date.now()).getTime()
        },
        fetchRefreshStatus: async () => {
          const response = await authFetch("/api/sync/refresh-status")
          const data = await response.json()
          if (!response.ok) throw new Error(data.error || "Could not read sync status")
          return data
        },
      })
      onComplete?.()
    } catch {
      // Silent background sync — next poll will retry.
    } finally {
      inFlightRef.current = false
    }
  }, [onComplete])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const runOnMount = !mountedRef.current
    mountedRef.current = true

    function scheduleNext(delayMs?: number) {
      if (cancelled) return
      const seconds = pollSecondsRef.current
      const waitMs = delayMs ?? (seconds > 0 ? seconds * 1000 : 5000)

      timer = window.setTimeout(async () => {
        if (cancelled) return

        if (pollSecondsRef.current > 0 && document.visibilityState === "visible") {
          await runSync()
        }

        scheduleNext()
      }, waitMs)
    }

    if (runOnMount && pollSecondsRef.current > 0) {
      void runSync()
    }
    scheduleNext(pollSecondsRef.current > 0 ? pollSecondsRef.current * 1000 : 5000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled, pollSeconds, runSync])
}
