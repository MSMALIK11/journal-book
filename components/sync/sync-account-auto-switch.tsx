"use client"

import { useCallback } from "react"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import type { TradeSyncEventDetail } from "@/hooks/use-trade-sync-listener"
import { useToast } from "@/hooks/use-toast"

function isBackgroundReconcileEvent(data: TradeSyncEventDetail) {
  const id = data.latestTrade?.id || ""
  if (id.startsWith("closed:")) return true
  if ((data.imported ?? 0) === 0 && (data.updated ?? 0) > 1) return true
  return false
}

/** Refresh accounts + trade/analytics data when extension syncs — never auto-switch account. */
export function SyncAccountAutoSwitch() {
  const { refresh, revalidateSyncedData } = useActiveAccount()
  const { toast } = useToast()

  const onSyncEvent = useCallback(
    (data: TradeSyncEventDetail) => {
      if (data.type === "accounts_updated") {
        const targetName =
          data.created?.find((account) => account.id === data.primaryAccountId)?.name ||
          data.created?.[data.created.length - 1]?.name

        void refresh().then(() => {
          toast({
            title: targetName ? `Portfolio ready: ${targetName}` : "New portfolio added",
            description: "Switch accounts in the sidebar when you want to view that portfolio.",
          })
        })
        return
      }

      if (data.type !== "trades_updated") return
      if (!(data.imported || data.updated)) return

      // Instant UI refresh first — toast can follow.
      void (async () => {
        const imported = data.imported ?? 0
        const updated = data.updated ?? 0

        try {
          await revalidateSyncedData()
        } catch {
          await revalidateSyncedData().catch(() => {})
        }

        if (isBackgroundReconcileEvent(data)) return

        if (imported > 0 && updated > 0) {
          toast({
            title: data.accountName ? `Synced to ${data.accountName}` : "Trades synced",
            description: `${imported} new, ${updated} updated from TradingView`,
          })
        } else if (imported > 0) {
          toast({
            title: data.accountName ? `New trade · ${data.accountName}` : "New trade synced",
            description: `${imported} new trade(s) from TradingView`,
          })
        } else if (updated > 0 && data.kind === "close") {
          toast({
            title: data.accountName ? `Trade closed · ${data.accountName}` : "Trade closed",
            description: "Position closed on TradingView",
          })
        }
      })()
    },
    [refresh, revalidateSyncedData, toast],
  )

  useTradeSyncEvent(onSyncEvent)

  return null
}
