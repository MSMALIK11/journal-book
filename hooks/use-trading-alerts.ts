"use client"

import { useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncConnection } from "@/hooks/use-trade-sync-event"
import { classifySession } from "@/lib/trading/sessions"
import type { CoachingVerdict } from "@/lib/trading/coaching-verdict"
import type { AlertItem } from "@/components/notifications/alert-list"
import type { MomentZoneSnapshot } from "@/lib/trading/trade-zones"

type AlertsResponse = {
  active: AlertItem[]
  topAction: AlertItem | null
  history: AlertItem[]
  unreadCount: number
  zones: MomentZoneSnapshot
  verdict: CoachingVerdict | null
  timezone: string
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Failed to load alerts")
  return data as AlertsResponse
}

const DIGEST_STORAGE_KEY = "jb_alert_digest_date"
const EVALUATE_MIN_MS = 20_000
const SSE_DOWN_FALLBACK_MS = 5 * 60_000

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Evaluation is a single expensive server pass, and this hook has several consumers (header, both
 * bells, the sync watcher). SWR already dedupes the GET, but the POST needs its own guard or every
 * consumer fires an identical request at once.
 */
let inFlightEvaluate: Promise<void> | null = null
let lastEvaluateAt = 0

function postEvaluate(includeDigest: boolean) {
  const now = Date.now()
  if (!includeDigest && now - lastEvaluateAt < EVALUATE_MIN_MS) {
    return inFlightEvaluate ?? Promise.resolve()
  }

  if (inFlightEvaluate) return inFlightEvaluate

  inFlightEvaluate = (async () => {
    try {
      await authFetch("/api/alerts/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeDigest }),
      })
      lastEvaluateAt = Date.now()
    } catch {
      // Coaching evaluate can fail; callers still reload stored new-trade alerts.
    } finally {
      inFlightEvaluate = null
    }
  })()

  return inFlightEvaluate
}

type UseTradingAlertsOptions = {
  /**
   * Owns the periodic evaluate/digest/session passes. Exactly one mounted consumer should set this
   * (`TradingAlertsSync`); read-only consumers just share the SWR cache.
   */
  poll?: boolean
}

export function useTradingAlerts(options?: UseTradingAlertsOptions) {
  const poll = options?.poll ?? false
  const sseConnected = useTradeSyncConnection()
  const { activeAccountId, switchVersion } = useActiveAccount()
  const digestRequested = useRef(false)
  const lastSessionRef = useRef<string | null>(null)

  const swrKey = activeAccountId ? `/api/alerts?limit=50&account=${activeAccountId}&v=${switchVersion}` : null

  const { data, error, isLoading, mutate } = useSWR<AlertsResponse>(swrKey, fetcher, {
    dedupingInterval: 45_000,
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const evaluate = useCallback(
    async (includeDigest = false) => {
      if (!activeAccountId) return
      await postEvaluate(includeDigest)
      try {
        await mutate()
      } catch {
        // silent — SSE / next evaluate retries
      }
    },
    [activeAccountId, mutate],
  )

  const refresh = useCallback(async () => {
    try {
      await mutate()
    } catch {
      // silent
    }
  }, [mutate])

  const markRead = useCallback(
    async (options: { ids?: string[]; all?: boolean }) => {
      if (!activeAccountId) return
      await authFetch("/api/alerts/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })
      await mutate()
    },
    [activeAccountId, mutate],
  )

  useEffect(() => {
    if (!poll || !activeAccountId) return

    void evaluate(false)

    // SSE pushes alerts_updated after evaluate — only poll when the stream is down.
    if (sseConnected) return

    const interval = setInterval(() => {
      void evaluate(false)
    }, SSE_DOWN_FALLBACK_MS)

    return () => clearInterval(interval)
  }, [poll, activeAccountId, switchVersion, sseConnected, evaluate])

  useEffect(() => {
    if (!poll || !activeAccountId || digestRequested.current) return

    const storageKey = `${DIGEST_STORAGE_KEY}:${activeAccountId}`
    const lastDigest = localStorage.getItem(storageKey)
    const today = todayKey()

    if (lastDigest !== today) {
      digestRequested.current = true
      void evaluate(true).then(() => {
        localStorage.setItem(storageKey, today)
      })
    }
  }, [poll, activeAccountId, switchVersion, evaluate])

  useEffect(() => {
    const timezone = data?.timezone
    if (!poll || !timezone || !activeAccountId) return

    const checkSessionChange = () => {
      const now = new Date()
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
      const parts = formatter.formatToParts(now)
      const hour = Number.parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10)
      const minute = Number.parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10)
      const session = classifySession(hour, minute)

      if (lastSessionRef.current && lastSessionRef.current !== session) {
        void evaluate(false)
      }
      lastSessionRef.current = session
    }

    checkSessionChange()
    const interval = setInterval(checkSessionChange, 60_000)
    return () => clearInterval(interval)
  }, [poll, activeAccountId, data?.timezone, evaluate])

  return {
    active: data?.active ?? [],
    topAction: data?.topAction ?? null,
    history: data?.history ?? [],
    unreadCount: data?.unreadCount ?? 0,
    zones: data?.zones ?? null,
    verdict: data?.verdict ?? null,
    timezone: data?.timezone ?? null,
    isLoading,
    error,
    refresh,
    markRead,
    evaluate,
  }
}
