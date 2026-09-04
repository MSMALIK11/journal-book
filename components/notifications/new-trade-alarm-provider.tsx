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
const SEEN_ALARM_KEYS = "jb-seen-trade-alarms-v2"
const CATCHUP_WINDOW_MS = 2 * 60_000

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
  kind?: "open" | "close"
  imported?: number
  updated?: number
  latestTrade?: ImportedTradeSnapshot
}) {
  if (data.kind === "close") return false
  if (data.latestTrade?.is_open === false) return false
  return (data.imported ?? 0) > 0
}

function readSeenKeys(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(SEEN_ALARM_KEYS) || window.sessionStorage.getItem(SEEN_ALARM_KEYS)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.map(String) : [])
  } catch {
    return new Set()
  }
}

function writeSeenKeys(keys: Set<string>) {
  const serialized = JSON.stringify([...keys].slice(-80))
  try {
    window.localStorage.setItem(SEEN_ALARM_KEYS, serialized)
  } catch {
    try {
      window.sessionStorage.setItem(SEEN_ALARM_KEYS, serialized)
    } catch {
      // private mode / quota
    }
  }
}

function tradeAlarmKeys(accountId: string, trade: ImportedTradeSnapshot) {
  return [`${accountId}:${trade.id}:alarm`].filter(
    (key) => !key.includes("::") && !key.endsWith(":undefined:alarm"),
  )
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
    if (!open) return null
    return {
      id: String(open.id || open._id || ""),
      instrument: String(open.instrument || ""),
      trade_type: String(open.trade_type || ""),
      entry_date: String(open.entry_date || ""),
      entry_price: Number(open.entry_price || 0),
      signal: open.signal ?? "Open",
      is_open: true,
      createdAt: open.createdAt ? String(open.createdAt) : undefined,
    }
  } catch {
    return null
  }
}

/** true = still open, false = closed/missing, null = could not verify. */
async function tradeStillOpenInDb(
  accountId: string,
  tradeId: string,
): Promise<boolean | null> {
  if (!tradeId || tradeId.startsWith("test-") || tradeId.startsWith("closed:")) return false
  try {
    const response = await authFetch(
      `/api/trades?source=tradingview&limit=50${accountId ? `&account=${accountId}` : ""}`,
    )
    const data = await response.json()
    if (!response.ok) return null
    const trades = Array.isArray(data.trades) ? data.trades : []
    const row = trades.find((trade: { id?: string; _id?: string }) => String(trade.id || trade._id) === tradeId)
    if (!row) return false
    return isOpenSyncedTrade(row)
  } catch {
    return null
  }
}

export function NewTradeAlarmProvider({ children }: { children: ReactNode }) {
  const { activeAccountId, switchAccount } = useActiveAccount()
  const [alarm, setAlarm] = useState<NewTradeAlarmState | null>(null)
  const [open, setOpen] = useState(false)
  const seenImportKeysRef = useRef<Set<string>>(readSeenKeys())
  const inflightAlarmKeysRef = useRef<Set<string>>(new Set())
  const preferencesRef = useRef(DEFAULT_TRADE_ALARM_PREFERENCES)
  const catchupDoneRef = useRef(false)

  const { data: preferences = DEFAULT_TRADE_ALARM_PREFERENCES } = useSWR(
    TRADE_ALARM_PREFS_KEY,
    preferencesFetcher,
  )

  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])

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
      inflightAlarmKeysRef.current.delete(key)
    }
    writeSeenKeys(seenImportKeysRef.current)
  }, [])

  const isClaimed = useCallback((keys: string[]) => {
    return keys.some(
      (key) => seenImportKeysRef.current.has(key) || inflightAlarmKeysRef.current.has(key),
    )
  }, [])

  const claimKeys = useCallback((keys: string[]) => {
    if (!keys.length) return true
    if (isClaimed(keys)) return false
    for (const key of keys) inflightAlarmKeysRef.current.add(key)
    return true
  }, [isClaimed])

  const releaseKeys = useCallback((keys: string[]) => {
    for (const key of keys) inflightAlarmKeysRef.current.delete(key)
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

      const targetAccountId = payload.accountId || activeAccountId || ""
      const earlyKeys =
        !payload.force && payload.latestTrade
          ? tradeAlarmKeys(targetAccountId, payload.latestTrade)
          : []

      // In-memory claim only — persist after the alarm actually starts.
      if (earlyKeys.length && !claimKeys(earlyKeys)) return

      // Live open from the sync event only — never alarm a closed last row.
      let trade = resolveOpenTradeForAlarm(payload.latestTrade)

      if (!trade && targetAccountId && !payload.force && (payload.imported ?? 0) > 0) {
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
      if (!trade) {
        releaseKeys(earlyKeys)
        return
      }

      if (!payload.force && trade.id) {
        const stillOpen = await tradeStillOpenInDb(targetAccountId, trade.id)
        if (stillOpen === false) {
          releaseKeys(earlyKeys)
          return
        }
      }

      const finalKeys = payload.force ? [] : tradeAlarmKeys(targetAccountId, trade)
      const newKeys = finalKeys.filter((key) => !earlyKeys.includes(key))
      if (newKeys.length && !claimKeys(newKeys)) {
        releaseKeys(earlyKeys)
        return
      }
      if (!payload.force) markSeen(...earlyKeys, ...finalKeys)

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
          }

          const alertsResponse = await authFetch(`/api/alerts?limit=1&account=${targetAccountId}`)
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
    [activeAccountId, claimKeys, markSeen, releaseKeys, startSound, switchAccount],
  )

  const onSyncEvent = useCallback(
    (data: {
      type?: string
      eventId?: string
      kind?: "open" | "close"
      at?: string
      imported?: number
      updated?: number
      accountId?: string
      accountName?: string
      latestTrade?: ImportedTradeSnapshot
    }) => {
      if (data.type !== "trades_updated") return
      if (data.kind === "close" || data.latestTrade?.is_open === false) return
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
          instrument: "XAUUSD",
          trade_type: "Buy",
          entry_date: new Date().toISOString(),
          entry_price: 2345.5,
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
        const events = Array.isArray(data?.events) && data.events.length
          ? data.events
          : data?.event
            ? [data.event]
            : []
        const event = [...events].reverse().find((item: {
          kind?: "open" | "close"
          imported?: number
          latestTrade?: ImportedTradeSnapshot
        }) => shouldConsiderAlarm(item))
        if (!response.ok || !event?.eventId || !shouldConsiderAlarm(event)) return
        if (event.kind === "close" || event.latestTrade?.is_open !== true) return
        if (/\b(tp\/sl|exit\s+(long|short))\b/i.test(String(event.latestTrade.signal || ""))) return

        const ageMs = event.at ? Date.now() - new Date(event.at).getTime() : CATCHUP_WINDOW_MS + 1
        if (ageMs > CATCHUP_WINDOW_MS) return

        if (event.latestTrade) {
          const keys = tradeAlarmKeys(event.accountId || "", event.latestTrade)
          if (keys.some((key) => seenImportKeysRef.current.has(key))) return
        }

        await triggerAlarm({
          accountId: event.accountId || "",
          accountName: event.accountName,
          imported: event.imported,
          updated: event.updated,
          latestTrade: event.latestTrade,
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
