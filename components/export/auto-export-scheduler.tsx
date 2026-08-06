"use client"

import { useEffect, useRef } from "react"
import { authFetch } from "@/lib/client-auth"
import {
  normalizeAutoExportPreferences,
  type AutoExportPreferences,
} from "@/lib/auto-export-settings"
import {
  dayKeyInTimezone,
  isLastDayOfMonthInTimezone,
  monthKeyInTimezone,
  timeInTimezone,
} from "@/lib/trading/export-trades-csv"
import { useToast } from "@/hooks/use-toast"

function isPastExportTime(current: string, target: string) {
  const [ch, cm] = current.split(":").map(Number)
  const [th, tm] = target.split(":").map(Number)
  return ch * 60 + cm >= th * 60 + tm
}

/** Checks every minute; runs daily and/or month-end export after the configured time (browser must stay open). */
export function AutoExportScheduler() {
  const { toast } = useToast()
  const prefsRef = useRef<AutoExportPreferences | null>(null)
  const timezoneRef = useRef("Asia/Kolkata")
  const runningDailyRef = useRef(false)
  const runningMonthlyRef = useRef(false)
  const triggeredDayRef = useRef<string | null>(null)
  const triggeredMonthRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadPrefs() {
      try {
        const response = await authFetch("/api/settings/auto-export")
        const data = await response.json()
        if (!response.ok || cancelled) return
        prefsRef.current = normalizeAutoExportPreferences(data.preferences)
        timezoneRef.current = data.timezone || "Asia/Kolkata"
        triggeredDayRef.current = prefsRef.current.lastExportDayKey ?? null
        triggeredMonthRef.current = prefsRef.current.lastMonthlyExportMonthKey ?? null
      } catch {
        // retry on next tick
      }
    }

    void loadPrefs()
    const refreshTimer = window.setInterval(() => {
      void loadPrefs()
    }, 5 * 60_000)

    async function tickDaily() {
      const prefs = prefsRef.current
      if (!prefs?.enabled || runningDailyRef.current) return

      const now = new Date()
      const timezone = timezoneRef.current
      const dayKey = dayKeyInTimezone(now, timezone)
      const currentTime = timeInTimezone(now, timezone)

      if (!isPastExportTime(currentTime, prefs.time)) return
      if (triggeredDayRef.current === dayKey || prefs.lastExportDayKey === dayKey) return

      runningDailyRef.current = true
      try {
        const response = await authFetch("/api/export/daily", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Daily auto-export failed")

        triggeredDayRef.current = dayKey
        if (data.skipped) return

        toast({
          title: "Daily export saved on server",
          description: data.message || data.path || `${data.count ?? 0} trade(s)`,
        })

        await loadPrefs()
      } catch (error) {
        toast({
          title: "Daily auto-export failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        runningDailyRef.current = false
      }
    }

    async function tickMonthly() {
      const prefs = prefsRef.current
      if (!prefs?.monthlyEnabled || runningMonthlyRef.current) return

      const now = new Date()
      const timezone = timezoneRef.current
      const monthKey = monthKeyInTimezone(now, timezone)
      const currentTime = timeInTimezone(now, timezone)

      if (!isLastDayOfMonthInTimezone(now, timezone)) return
      if (!isPastExportTime(currentTime, prefs.time)) return
      if (
        triggeredMonthRef.current === monthKey ||
        prefs.lastMonthlyExportMonthKey === monthKey
      ) {
        return
      }

      runningMonthlyRef.current = true
      try {
        const response = await authFetch("/api/export/monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Monthly auto-export failed")

        triggeredMonthRef.current = monthKey
        if (data.skipped) return

        toast({
          title: "Monthly export saved on server",
          description: data.message || data.path || `${data.count ?? 0} trade(s)`,
        })

        await loadPrefs()
      } catch (error) {
        toast({
          title: "Monthly auto-export failed",
          description: error instanceof Error ? error.message : "Unknown error",
          variant: "destructive",
        })
      } finally {
        runningMonthlyRef.current = false
      }
    }

    async function tick() {
      await tickDaily()
      await tickMonthly()
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
  }, [toast])

  return null
}
