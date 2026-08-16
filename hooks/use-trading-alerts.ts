"use client"

import { useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
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

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

export function useTradingAlerts() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const digestRequested = useRef(false)
  const lastSessionRef = useRef<string | null>(null)

  const swrKey = activeAccountId ? `/api/alerts?limit=50&account=${activeAccountId}&v=${switchVersion}` : null

  const { data, error, isLoading, mutate } = useSWR<AlertsResponse>(swrKey, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  })

  const evaluate = useCallback(
    async (includeDigest = false) => {
      if (!activeAccountId) return
      try {
        await authFetch("/api/alerts/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ includeDigest }),
        })
      } catch {
        // Coaching evaluate can fail; still reload stored new-trade alerts.
      }
      try {
        await mutate()
      } catch {
        // silent — next poll retries
      }
    },
    [activeAccountId, mutate],
  )

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
    if (!activeAccountId) return

    void evaluate(false)

    const interval = setInterval(() => {
      void evaluate(false)
    }, 60_000)

    return () => clearInterval(interval)
  }, [activeAccountId, switchVersion, evaluate])

  useEffect(() => {
    if (!activeAccountId || digestRequested.current) return

    const storageKey = `${DIGEST_STORAGE_KEY}:${activeAccountId}`
    const lastDigest = localStorage.getItem(storageKey)
    const today = todayKey()

    if (lastDigest !== today) {
      digestRequested.current = true
      void evaluate(true).then(() => {
        localStorage.setItem(storageKey, today)
      })
    }
  }, [activeAccountId, switchVersion, evaluate])

  useEffect(() => {
    const timezone = data?.timezone
    if (!timezone || !activeAccountId) return

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
    const interval = setInterval(checkSessionChange, 30_000)
    return () => clearInterval(interval)
  }, [activeAccountId, data?.timezone, evaluate])

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
    refresh: mutate,
    markRead,
    evaluate,
  }
}
