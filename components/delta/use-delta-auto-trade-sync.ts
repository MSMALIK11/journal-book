"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import type { DeltaTradeMode } from "@/components/delta/delta-account-selector"
import { deltaApiPath, type DeltaEnvironment } from "@/components/delta/delta-shared"
import {
  type DeltaAutoTradeConfig,
  type DeltaAutoTradeMarginPct,
  type DeltaAutoTradeSymbol,
  type DeltaLeverageBySymbol,
} from "@/lib/delta/auto-trade-settings"
import { authFetch } from "@/lib/client-auth"

type AutoTradeLog = {
  id: string
  kind: "open" | "close"
  status: "success" | "partial" | "failed" | "skipped"
  symbol?: string
  lots?: number
  error?: string
  accountResults?: Array<{ label: string; ok: boolean; error?: string }>
  createdAt?: string
}

type UseDeltaAutoTradeSyncInput = {
  environment: DeltaEnvironment
  configured: boolean
  serverLiveBlocked: boolean
  tradeMode: DeltaTradeMode
  singleAccountId: string | null
  broadcastAccountIds: string[]
  symbol: string
  marginPct: number | null
}

export function useDeltaAutoTradeSync({
  environment,
  configured,
  serverLiveBlocked,
  tradeMode,
  singleAccountId,
  broadcastAccountIds,
  symbol,
  marginPct,
}: UseDeltaAutoTradeSyncInput) {
  const isLive = environment === "live"
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [leverageBySymbol, setLeverageBySymbol] = useState<DeltaLeverageBySymbol>({})
  const [lastLog, setLastLog] = useState<AutoTradeLog | null>(null)
  const [serverBlocked, setServerBlocked] = useState(false)
  const hydratedRef = useRef(false)

  const canEnable = configured && (!isLive || !serverLiveBlocked)

  const buildPayload = useCallback(
    (partial: Partial<DeltaAutoTradeConfig>): Partial<DeltaAutoTradeConfig> => ({
      tradeMode,
      singleAccountId: singleAccountId ?? undefined,
      broadcastAccountIds,
      symbol: symbol as DeltaAutoTradeConfig["symbol"],
      marginPct: (marginPct ?? 25) as DeltaAutoTradeMarginPct,
      ...partial,
    }),
    [broadcastAccountIds, marginPct, singleAccountId, symbol, tradeMode],
  )

  const patchSettings = useCallback(
    async (partial: Partial<DeltaAutoTradeConfig>) => {
      setSaving(true)
      try {
        const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildPayload(partial)),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to save auto-trade settings")
        const config = data.config as DeltaAutoTradeConfig
        setEnabled(config.enabled)
        setLeverageBySymbol(config.leverageBySymbol ?? {})
        setLastLog(Array.isArray(data.recentLogs) && data.recentLogs.length > 0 ? data.recentLogs[0] : null)
        return config
      } finally {
        setSaving(false)
      }
    },
    [buildPayload, environment],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment))
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Failed to load auto-trade settings")
        if (cancelled) return
        const config = data.config as DeltaAutoTradeConfig
        setEnabled(config.enabled)
        setLeverageBySymbol(config.leverageBySymbol ?? {})
        setServerBlocked(Boolean(data.serverLiveBlocked) || serverLiveBlocked)
        setLastLog(Array.isArray(data.recentLogs) && data.recentLogs.length > 0 ? data.recentLogs[0] : null)
      } catch {
        if (!cancelled) setEnabled(false)
      } finally {
        if (!cancelled) {
          hydratedRef.current = true
          setLoading(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [environment, serverLiveBlocked])

  useEffect(() => {
    if (!hydratedRef.current || !enabled) return
    const timer = window.setTimeout(() => {
      void patchSettings({ enabled: true }).catch(() => undefined)
    }, 400)
    return () => window.clearTimeout(timer)
  }, [enabled, tradeMode, singleAccountId, broadcastAccountIds, symbol, marginPct, patchSettings])

  async function toggleEnabled(checked: boolean) {
    if (checked && !canEnable) return
    await patchSettings({ enabled: checked })
  }

  const sym = symbol.toUpperCase() as DeltaAutoTradeSymbol
  const savedLeverage = leverageBySymbol[sym] ?? null
  const hasSavedLeverage = savedLeverage != null

  async function saveLeverage(leverage: number) {
    setSaving(true)
    try {
      const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...buildPayload({}),
          leverage,
          symbol: sym,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to save leverage")
      const config = data.config as DeltaAutoTradeConfig
      setLeverageBySymbol(config.leverageBySymbol ?? {})
    } finally {
      setSaving(false)
    }
  }

  return {
    loading,
    saving,
    enabled,
    leverageBySymbol,
    savedLeverage,
    hasSavedLeverage,
    saveLeverage,
    lastLog,
    serverLiveBlocked: serverBlocked,
    canEnable,
    toggleEnabled,
    formatLogTime: (createdAt?: string) =>
      createdAt ? formatDistanceToNow(new Date(createdAt), { addSuffix: true }) : null,
  }
}
