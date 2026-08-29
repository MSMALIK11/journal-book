"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { authFetch } from "@/lib/client-auth"
import { requestExtensionSync } from "@/lib/client-extension-sync"

type Options = {
  enabled: boolean
  pollSeconds: number
  onComplete?: (result: import("@/lib/client-extension-sync").ExtensionSyncResult | null) => void
}

/** Live Sync page always checks TV — "Off" still uses a fast 5s safety poll. */
function effectivePollSeconds(seconds: number) {
  return seconds > 0 ? seconds : 5
}

export function useLiveSyncAutoRefresh({ enabled, pollSeconds, onComplete }: Options) {
  const inFlightRef = useRef(false)
  const pollSecondsRef = useRef(pollSeconds)
  const mountedRef = useRef(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)

  useEffect(() => {
    pollSecondsRef.current = pollSeconds
  }, [pollSeconds])

  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  }, [onComplete])

  const runSync = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsSyncing(true)
    try {
      const result = await requestExtensionSync({
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
      const softWait =
        result?.message === "Waiting for List of trades" ||
        /list of trades|waiting for list|ka-table|0 rows/i.test(
          String(result?.warning || result?.error || ""),
        )
      if (result?.error && !softWait) {
        setLastError(String(result.error))
      } else {
        setLastError(null)
      }
      onCompleteRef.current?.(result)
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Sync failed")
    } finally {
      inFlightRef.current = false
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const runOnMount = !mountedRef.current
    mountedRef.current = true

    function scheduleNext(delayMs?: number) {
      if (cancelled) return
      const seconds = effectivePollSeconds(pollSecondsRef.current)
      const waitMs = delayMs ?? seconds * 1000

      timer = window.setTimeout(async () => {
        if (cancelled) return

        if (document.visibilityState === "visible") {
          await runSync()
        }

        scheduleNext()
      }, waitMs)
    }

    if (runOnMount) {
      void runSync()
    }
    scheduleNext(effectivePollSeconds(pollSeconds) * 1000)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled, pollSeconds, runSync])

  return { isSyncing, lastError, runSync }
}
