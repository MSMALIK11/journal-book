"use client"

import { useEffect } from "react"
import { useActiveAccount } from "@/hooks/use-active-account"
import { useToast } from "@/hooks/use-toast"

/** Refresh sidebar accounts + switch when extension syncs a new symbol portfolio. */
export function SyncAccountAutoSwitch() {
  const { activeAccountId, switchAccount, refresh } = useActiveAccount()
  const { toast } = useToast()

  useEffect(() => {
    const es = new EventSource("/api/sync/events")

    es.onmessage = (message) => {
      try {
        const data = JSON.parse(message.data) as {
          type?: string
          accountId?: string
          accountName?: string
          imported?: number
          updated?: number
          created?: { id: string; name: string }[]
          primaryAccountId?: string
        }

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

        void refresh().then(async () => {
          if (data.accountId && data.accountId !== activeAccountId) {
            await switchAccount(data.accountId)
          }
          toast({
            title: data.accountName ? `Synced to ${data.accountName}` : "Trades synced",
            description: `${data.imported ?? 0} new, ${data.updated ?? 0} updated from extension`,
          })
        })
      } catch {
        // ignore malformed events
      }
    }

    return () => es.close()
  }, [activeAccountId, refresh, switchAccount, toast])

  return null
}
