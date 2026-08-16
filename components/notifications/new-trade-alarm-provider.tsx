"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { NewTradeAlarmModal, type NewTradeAlarmState } from "@/components/notifications/new-trade-alarm-modal"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import { authFetch } from "@/lib/client-auth"
import {
  DEFAULT_TRADE_ALARM_PREFERENCES,
  normalizeTradeAlarmPreferences,
  type TradeAlarmPreferences,
} from "@/lib/new-trade-alarm-settings"
import type { ImportedTradeSnapshot } from "@/lib/sync-events"
import { playTradeAlarmSound, stopTradeAlarmSound, unlockTradeAlarmAudio } from "@/lib/trade-alarm-sound"
import { buildFallbackTradeAdvice, buildTradeMomentAdvice } from "@/lib/trading/trade-moment-advice"
import { isOpenTvSignal, isOpenSyncedTrade } from "@/lib/trading/tradingview-open"
import type { MomentZoneSnapshot } from "@/lib/trading/trade-zones"

const TRADE_ALARM_PREFS_KEY = "/api/settings/trade-alarm"
const SEEN_ALARM_KEYS = "jb-seen-trade-alarms"
const CATCHUP_WINDOW_MS = 60 * 60_000

const preferencesFetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Failed to load trade alarm preferences")
  return normalizeTradeAlarmPreferences(data.preferences as Partial<TradeAlarmPreferences>)
}

function resolveOpenTradeForAlarm(
  latestTrade?: ImportedTradeSnapshot | null,
): ImportedTradeSnapshot | null {
  // Alarm only for OPEN trades — never closed LONG/SHORT syncs.
  if (!latestTrade) return null
  if (latestTrade.is_open === true) return latestTrade
  if (latestTrade.is_open === false) return null
  // Some payloads omit is_open and only send signal "Open".
  if (isOpenTvSignal(latestTrade.signal)) return { ...latestTrade, is_open: true }
  return null
}

function shouldConsiderAlarm(data: {
  imported?: number
  updated?: number
  latestTrade?: ImportedTradeSnapshot
}) {
  if ((data.imported ?? 0) > 0) return true
  if (resolveOpenTradeForAlarm(data.latestTrade)) return true
  // New fill that was merged into an existing row — still notify once per trade id.
  if ((data.updated ?? 0) > 0 && data.latestTrade) return true
  return false
}

function readSeenKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_ALARM_KEYS)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeSeenKeys(keys: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_ALARM_KEYS, JSON.stringify([...keys].slice(-40))
    )
  } catch {
    // private mode / quota
  }
}

async function fetchLatestAlarmTrade(
  accountId: string,
): Promise<(ImportedTradeSnapshot & { createdAt?: string }) | null> {
  try {
    const response = await authFetch(
      `/api/trades?source=tradingview&limit=20${accountId ? `&account=${accountId}` : ""}`,
    )
    const data = await response.json()
    if (!response.ok) return null
    const trades = Array.isArray(data.trades) ? data.trades : []
    const open = trades.find((trade: { is_open?: boolean; signal?: string; exit_date?: string | null; tags?: string[] }) =>
      isOpenSyncedTrade(trade),
    )
    const chosen = open || trades[0]
    if (!chosen) return null
    return {
      id: String(chosen.id || chosen._id || ""),
      instrument: String(chosen.instrument || ""),
      trade_type: String(chosen.trade_type || ""),
      entry_date: String(chosen.entry_date || ""),
      entry_price: Number(chosen.entry_price || 0),
      signal: chosen.signal ?? (chosen.is_open ? "Open" : chosen.signal),
      is_open: Boolean(open) || chosen.is_open === true,
      createdAt: chosen.createdAt ? String(chosen.createdAt) : undefined,
    }
  } catch {
    return null
  }
}

export function NewTradeAlarmProvider({ children }: { children: ReactNode }) {
  const { activeAccountId, switchAccount, refresh, switchVersion, revalidateSyncedData } = useActiveAccount()
  const [alarm, setAlarm] = useState<NewTradeAlarmState | null>(null)
  const [open, setOpen] = useState(false)
  const seenImportKeysRef = useRef<Set<string>>(new Set())
  const preferencesRef = useRef(DEFAULT_TRADE_ALARM_PREFERENCES)
  const catchupDoneRef = useRef(false)

  const { data: preferences = DEFAULT_TRADE_ALARM_PREFERENCES } = useSWR(
    TRADE_ALARM_PREFS_KEY,
    preferencesFetcher,
  )

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

  useEffect(() => {
    seenImportKeysRef.current = readSeenKeys()
  }, [])

  // Browsers block audio until a user gesture — unlock once so alarms can ring.
  useEffect(() => {
    const unlock = () => {
      void unlockTradeAlarmAudio()
    }
    window.addEventListener("pointerdown", unlock, { once: true, capture: true })
    window.addEventListener("keydown", unlock, { once: true, capture: true })
    return () => {
      window.removeEventListener("pointerdown", unlock, true)
      window.removeEventListener("keydown", unlock, true)
    }
  }, [])

  const stopAlarm = useCallback(() => {
    stopTradeAlarmSound()
    setOpen(false)
    setAlarm(null)
  }, [])

  const startSound = useCallback(
    (soundId: TradeAlarmPreferences["soundId"], mode: TradeAlarmPreferences["soundMode"]) => {
      stopTradeAlarmSound()
      playTradeAlarmSound(soundId, mode)
    },
    [],
  )

  const markSeen = useCallback((...keys: string[]) => {
    for (const key of keys) {
      if (!key) continue
      seenImportKeysRef.current.add(key)
    }
    writeSeenKeys(seenImportKeysRef.current)
  }, [])

  const triggerAlarm = useCallback(
    async (payload: {
      accountId: string
      accountName?: string
      imported?: number
      updated?: number
      latestTrade?: ImportedTradeSnapshot
      eventId?: string
      eventAt?: string
      force?: boolean
    }) => {
      const prefs = preferencesRef.current
      if (!prefs.enabled && !payload.force) return
      if (!payload.force && !shouldConsiderAlarm(payload)) return

      const dedupeKey =
        payload.eventId ||
        `${payload.accountId}:${payload.latestTrade?.id ?? "none"}:${payload.latestTrade?.entry_date ?? ""}:import`
      if (!payload.force && seenImportKeysRef.current.has(dedupeKey)) return

      const targetAccountId = payload.accountId || activeAccountId || ""

      // 1) Live open from the sync event (best case — what worked for the 01:15 fill).
      let trade = resolveOpenTradeForAlarm(payload.latestTrade)

      // 2) Any newly imported row — including longs TV labeled as closed/side-only.
      if (!trade && payload.latestTrade && (payload.imported ?? 0) > 0) {
        trade = payload.latestTrade
      }

      // 3) Update of a live (or just-synced) fill when the first import event was missed.
      if (!trade && payload.latestTrade && (payload.updated ?? 0) > 0) {
        trade = payload.latestTrade
      }

      // 4) Mixed batch: event snapshot missing — load newest/open from that account.
      if (!trade && targetAccountId && !payload.force && ((payload.imported ?? 0) > 0 || (payload.updated ?? 0) > 0)) {
        const candidate = await fetchLatestAlarmTrade(targetAccountId)
        if (candidate) {
          const createdMs = candidate.createdAt ? new Date(candidate.createdAt).getTime() : NaN
          const eventMs = payload.eventAt ? new Date(payload.eventAt).getTime() : Date.now()
          if (!Number.isFinite(createdMs) || Math.abs(eventMs - createdMs) <= 15 * 60_000) {
            trade = candidate
          }
        }
      }

      if (!trade && payload.force) {
        trade = {
          id: `test-${Date.now()}`,
          instrument: "TEST",
          trade_type: "Buy",
          entry_date: new Date().toISOString(),
          entry_price: 0,
          signal: "Open",
          is_open: true,
        }
      }
      if (!trade) return

      // Dedupe by the actual trade identity — never block trade B because trade A already rang.
      const finalKey = `${payload.accountId}:${trade.id}:${trade.entry_date}:alarm`
      if (!payload.force && seenImportKeysRef.current.has(finalKey)) return
      if (!payload.force) markSeen(finalKey, dedupeKey)

      // Fire modal + sound immediately — refresh can follow.
      let advice = buildFallbackTradeAdvice({ isUpdate: false })
      setAlarm({
        trade,
        accountName: payload.accountName,
        importedCount: payload.imported || 1,
        advice,
      })
      setOpen(true)
      void unlockTradeAlarmAudio().finally(() => {
        startSound(prefs.soundId, prefs.soundMode)
      })

      if (payload.force) return

      void (async () => {
        try {
          if (targetAccountId && targetAccountId !== activeAccountId) {
            await switchAccount(targetAccountId)
          } else {
            await revalidateSyncedData()
            await refresh()
          }

          const alertsResponse = await authFetch(
            `/api/alerts?limit=1&account=${targetAccountId}&v=${switchVersion}`,
          )
          const alertsData = await alertsResponse.json()
          const zones = alertsData.zones as MomentZoneSnapshot | undefined
          if (zones) {
            advice = buildTradeMomentAdvice(zones)
            setAlarm((current) => (current ? { ...current, advice } : current))
          }
        } catch {
          // alarm already visible — refresh/advice are best-effort
        }
      })()
    },
    [activeAccountId, markSeen, revalidateSyncedData, refresh, startSound, switchAccount, switchVersion],
  )

  const onSyncEvent = useCallback(
    (data: {
      type?: string
      eventId?: string
      at?: string
      imported?: number
      updated?: number
      accountId?: string
      accountName?: string
      latestTrade?: ImportedTradeSnapshot
    }) => {
      if (data.type !== "trades_updated") return
      if (!shouldConsiderAlarm(data)) return

      void triggerAlarm({
        accountId: data.accountId || activeAccountId || "",
        accountName: data.accountName,
        imported: data.imported,
        updated: data.updated,
        latestTrade: data.latestTrade,
        eventId: data.eventId,
        eventAt: data.at,
      })
    },
    [activeAccountId, triggerAlarm],
  )

  useTradeSyncEvent(onSyncEvent)

  // Settings / Live Sync "Test alarm" button → full modal + sound path.
  useEffect(() => {
    function onTestAlarm() {
      void triggerAlarm({
        accountId: activeAccountId || "test",
        accountName: "Test",
        imported: 1,
        force: true,
        eventId: `manual-test-${Date.now()}`,
        latestTrade: {
          id: `manual-test-${Date.now()}`,
          instrument: "TEST",
          trade_type: "Buy",
          entry_date: new Date().toISOString(),
          entry_price: 0,
          signal: "Open",
          is_open: true,
        },
      })
    }
    window.addEventListener("jb-test-trade-alarm", onTestAlarm)
    return () => window.removeEventListener("jb-test-trade-alarm", onTestAlarm)
  }, [activeAccountId, triggerAlarm])

  // Catch-up: if the page was closed/backgrounded when an open fill synced,
  // last-event still has it — ring once within the catch-up window.
  useEffect(() => {
    if (catchupDoneRef.current) return
    catchupDoneRef.current = true

    void (async () => {
      try {
        const response = await authFetch("/api/sync/last-event")
        const data = await response.json()
        const event = data?.event
        if (!response.ok || !event?.eventId || !shouldConsiderAlarm(event)) return

        const ageMs = event.at ? Date.now() - new Date(event.at).getTime() : CATCHUP_WINDOW_MS + 1
        if (ageMs > CATCHUP_WINDOW_MS) return

        await triggerAlarm({
          accountId: event.accountId || "",
          accountName: event.accountName,
          imported: event.imported,
          updated: event.updated,
          latestTrade: event.latestTrade,
          eventId: `catchup:${event.eventId}`,
          eventAt: event.at,
        })
      } catch {
        // ignore — live events still work
      }
    })()
  }, [triggerAlarm])

  useEffect(() => () => stopTradeAlarmSound(), [])

  return (
    <>
      {children}
      <NewTradeAlarmModal open={open} alarm={alarm} onStop={stopAlarm} />
    </>
  )
}

export function refreshTradeAlarmPreferences() {
  return globalMutate(TRADE_ALARM_PREFS_KEY)
}
