"use client"

import { useCallback } from "react"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useTradeSyncEvent } from "@/hooks/use-trade-sync-event"
import type { TradeSyncEventDetail } from "@/hooks/use-trade-sync-listener"
import { useToast } from "@/hooks/use-toast"

/** Refresh accounts + all trade/analytics data when extension syncs (new or closed trades). */
export function SyncAccountAutoSwitch() {
  const { activeAccountId, switchAccount, refresh, revalidateSyncedData } = useActiveAccount()
  const { toast } = useToast()

  const onSyncEvent = useCallback(
    (data: TradeSyncEventDetail) => {
      if (data.type === "accounts_updated") {
        const targetId = data.primaryAccountId || data.created?.[data.created.length - 1]?.id
        const targetName =
          data.created?.find((account) => account.id === targetId)?.name ||
          data.created?.[data.created.length - 1]?.name

        void refresh().then(async () => {
          if (targetId && targetId !== activeAccountId) {
            await switchAccount(targetId)
          }
          toast({
            title: targetName ? `Portfolio ready: ${targetName}` : "New portfolio added",
            description: "Switch accounts in the sidebar to test each symbol separately.",
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

        if (data.accountId && data.accountId !== activeAccountId) {
          await switchAccount(data.accountId)
        } else {
          await revalidateSyncedData()
          await refresh()
        }

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
        } else if (updated > 0) {
          const closed = data.latestTrade?.is_open === false
          toast({
            title: data.accountName
              ? closed
                ? `Trade closed · ${data.accountName}`
                : `Trade updated · ${data.accountName}`
              : closed
                ? "Trade closed"
                : "Trade updated",
            description: closed
              ? `${updated} trade(s) closed on TradingView`
              : `${updated} trade(s) updated from TradingView`,
          })
        }
      })()
    },
    [activeAccountId, refresh, revalidateSyncedData, switchAccount, toast],
  )

  useTradeSyncEvent(onSyncEvent)

  return null
}
