"use client"

import { useEffect, useRef } from "react"
import type { AlertItem } from "@/components/notifications/alert-list"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"
import { toast } from "@/hooks/use-toast"
import type { CoachingVerdict } from "@/lib/trading/coaching-verdict"

const TOAST_DURATION_MS = 7_000

function toastVariantForSeverity(severity: AlertItem["severity"]) {
  return severity === "danger" ? ("destructive" as const) : ("default" as const)
}

function showAlertToast(item: AlertItem, options?: { coach?: boolean }) {
  const parts = [item.message, item.action].filter(Boolean)
  toast({
    title: options?.coach ? `Coach · ${item.title}` : item.title,
    description: parts.length ? parts.join(" · ") : undefined,
    variant: toastVariantForSeverity(item.severity),
    duration: TOAST_DURATION_MS,
  })
}

function showVerdictToast(verdict: CoachingVerdict) {
  if (verdict.level === "go") return
  const detail = [verdict.action, verdict.reasons[0]?.title].filter(Boolean).join(" · ")
  toast({
    title: `Trading coach · ${verdict.headline}`,
    description: detail || undefined,
    variant: verdict.level === "stop" ? "destructive" : "default",
    duration: TOAST_DURATION_MS,
  })
}

function seedKeys(items: AlertItem[]) {
  return new Set(items.map((item) => item.key))
}

/** Surfaces new alerts + coaching verdict changes as on-screen toasts (bells unchanged). */
export function AlertToastSync() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const { active, topAction, verdict, isLoading, readKeys } = useTradingAlerts()

  const primedRef = useRef(false)
  const seenKeysRef = useRef<Set<string>>(new Set())
  const verdictSnapshotRef = useRef<string | null>(null)

  useEffect(() => {
    primedRef.current = false
    seenKeysRef.current = new Set()
    verdictSnapshotRef.current = null
  }, [activeAccountId, switchVersion])

  useEffect(() => {
    if (!activeAccountId || isLoading) return

    const readKeySet = new Set(readKeys)

    if (!primedRef.current) {
      seenKeysRef.current = seedKeys(active)
      for (const key of readKeys) seenKeysRef.current.add(key)
      if (topAction?.key) seenKeysRef.current.add(topAction.key)
      verdictSnapshotRef.current = verdict ? `${verdict.level}:${verdict.headline}` : null
      primedRef.current = true
      return
    }

    for (const key of readKeys) seenKeysRef.current.add(key)

    for (const item of active) {
      if (seenKeysRef.current.has(item.key) || readKeySet.has(item.key)) continue
      seenKeysRef.current.add(item.key)
      const coach =
        item.category !== "new_trade" &&
        item.category !== "delta_trade" &&
        topAction?.key === item.key
      showAlertToast(item, { coach })
    }

    if (topAction && !seenKeysRef.current.has(topAction.key) && !readKeySet.has(topAction.key)) {
      seenKeysRef.current.add(topAction.key)
      showAlertToast(topAction, { coach: true })
    }

    if (verdict) {
      const snapshot = `${verdict.level}:${verdict.headline}`
      if (snapshot !== verdictSnapshotRef.current) {
        const wasPrimed = verdictSnapshotRef.current != null
        verdictSnapshotRef.current = snapshot
        if (wasPrimed && (verdict.level === "stop" || verdict.level === "caution")) {
          showVerdictToast(verdict)
        }
      }
    }
  }, [active, topAction, verdict, isLoading, activeAccountId, readKeys])

  return null
}
