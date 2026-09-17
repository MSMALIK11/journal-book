"use client"

import { useEffect, useRef } from "react"
import { authFetch } from "@/lib/client-auth"
import {
  normalizeTelegramPreferences,
  type TelegramPreferences,
} from "@/lib/telegram/settings"
import { dayKeyInTimezone, timeInTimezone } from "@/lib/trading/export-trades-csv"

function isPastSummaryTime(current: string, target: string) {
  const [ch, cm] = current.split(":").map(Number)
  const [th, tm] = target.split(":").map(Number)
  const currentMinutes = ((ch === 24 ? 0 : ch) || 0) * 60 + (cm || 0)
  const targetMinutes = ((th === 24 ? 0 : th) || 0) * 60 + (tm || 0)
  return currentMinutes >= targetMinutes
}

/** Sends today's P&L list to Telegram after the configured time (journal tab must stay open). */
export function TelegramDailySummaryScheduler() {
  const prefsRef = useRef<TelegramPreferences | null>(null)
  const timezoneRef = useRef("Asia/Kolkata")
  const runningRef = useRef(false)
  const triggeredDayRef = useRef<string | null>(null)
  const linkedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function loadPrefs() {
      try {
        const response = await authFetch("/api/settings/telegram")
        const data = await response.json()
        if (!response.ok || cancelled) return
        prefsRef.current = normalizeTelegramPreferences(data.preferences)
        timezoneRef.current = data.timezone || "Asia/Kolkata"
        triggeredDayRef.current = prefsRef.current.lastDailySummaryDayKey ?? null
        linkedRef.current = Boolean(data.destinationConfigured) || Boolean(prefsRef.current.chatId)
      } catch {
        // retry on next tick
      }
    }

    void loadPrefs()
    const refreshTimer = window.setInterval(() => {
      void loadPrefs()
    }, 5 * 60_000)

    async function tick() {
      const prefs = prefsRef.current
      if (!prefs?.dailySummaryEnabled || runningRef.current) return
      if (!linkedRef.current) return

      const now = new Date()
      const timezone = timezoneRef.current
      const dayKey = dayKeyInTimezone(now, timezone)
      const currentTime = timeInTimezone(now, timezone)

      if (!isPastSummaryTime(currentTime, prefs.dailySummaryTime)) return
      if (triggeredDayRef.current === dayKey || prefs.lastDailySummaryDayKey === dayKey) return

      runningRef.current = true
      try {
        const response = await authFetch("/api/telegram/daily-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Daily Telegram summary failed")
        triggeredDayRef.current = dayKey
        await loadPrefs()
      } catch {
        // heartbeat / next minute retry
      } finally {
        runningRef.current = false
      }
    }

    const timer = window.setInterval(() => {
      void tick()
    }, 60_000)
    void tick()

    return () => {
      cancelled = true
      window.clearInterval(timer)
      window.clearInterval(refreshTimer)
    }
  }, [])

  return null
}
