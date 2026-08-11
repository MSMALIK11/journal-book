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

const preferencesFetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Failed to load trade alarm preferences")
  return normalizeTradeAlarmPreferences(data.preferences as Partial<TradeAlarmPreferences>)
}

function resolveOpenTradeForAlarm(
  latestTrade?: ImportedTradeSnapshot | null,
): ImportedTradeSnapshot | null {
  // Alarm only for newly imported OPEN trades — never closed LONG/SHORT syncs.
  if (!latestTrade) return null
  if (latestTrade.is_open === true) return latestTrade
  if (latestTrade.is_open === false) return null
  if (!isOpenTvSignal(latestTrade.signal)) return null
  return latestTrade
}

async function fetchLatestOpenTrade(accountId: string): Promise<ImportedTradeSnapshot | null> {
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

  const triggerAlarm = useCallback(
    async (payload: {
      accountId: string
      accountName?: string
      imported: number
      latestTrade?: ImportedTradeSnapshot
    }) => {
      const prefs = preferencesRef.current
      if (!prefs.enabled || payload.imported <= 0) return

      const dedupeKey = `${payload.accountId}:${payload.latestTrade?.id ?? "none"}:${payload.latestTrade?.entry_date ?? ""}:import`
      if (seenImportKeysRef.current.has(dedupeKey)) return

      const targetAccountId = payload.accountId || activeAccountId || ""

      // Resolve open trade — fallback fetch uses active-account cookie, so switch first.
      let trade = resolveOpenTradeForAlarm(payload.latestTrade)
      if (!trade) {
        try {
          if (targetAccountId && targetAccountId !== activeAccountId) {
            await switchAccount(targetAccountId)
          }
          trade = await fetchLatestOpenTrade(targetAccountId)
        } catch {
          trade = null
        }
      }
      if (!trade) return

      const finalKey = `${payload.accountId}:${trade.id}:${trade.entry_date}:import`
      if (seenImportKeysRef.current.has(finalKey)) return
      seenImportKeysRef.current.add(finalKey)
      seenImportKeysRef.current.add(dedupeKey)

      // Fire modal + sound immediately — refresh can follow.
      let advice = buildFallbackTradeAdvice({ isUpdate: false })
      setAlarm({
        trade,
        accountName: payload.accountName,
        importedCount: payload.imported,
        advice,
      })
      setOpen(true)
      void unlockTradeAlarmAudio().finally(() => {
        startSound(prefs.soundId, prefs.soundMode)
      })

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
    [activeAccountId, revalidateSyncedData, refresh, startSound, switchAccount, switchVersion],
  )

  const onSyncEvent = useCallback(
    (data: {
      type?: string
      imported?: number
      accountId?: string
      accountName?: string
      latestTrade?: ImportedTradeSnapshot
    }) => {
      if (data.type !== "trades_updated") return
      if (!data.imported || data.imported <= 0) return

      void triggerAlarm({
        accountId: data.accountId || activeAccountId || "",
        accountName: data.accountName,
        imported: data.imported,
        latestTrade: data.latestTrade,
      })
    },
    [activeAccountId, triggerAlarm],
  )

  useTradeSyncEvent(onSyncEvent)

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
