"use client"

import useSWR from "swr"
import { Radar } from "lucide-react"
import { authFetch } from "@/lib/client-auth"
import { cn } from "@/lib/utils"

type SyncStatus = {
  connected: boolean
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as SyncStatus
}

export function LiveBadge() {
  const { data } = useSWR<SyncStatus>("/api/sync/heartbeat", fetcher, { refreshInterval: 10_000 })
  const live = Boolean(data?.connected)

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
        live
          ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
          : "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {live ? <span className="hud-live-dot" /> : <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />}
      {live ? "Live" : "Offline"}
    </div>
  )
}

export function SystemStatus() {
  const { data } = useSWR<SyncStatus>("/api/sync/heartbeat", fetcher, { refreshInterval: 10_000 })
  const live = Boolean(data?.connected)

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        live ? "border-emerald-400/20 bg-emerald-500/5" : "border-border/70 bg-muted/20",
      )}
    >
      <Radar className={cn("h-4 w-4", live ? "text-emerald-400" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="hud-label">{live ? "All systems" : "Systems"}</p>
        <p className={cn("truncate text-[11px] font-semibold", live ? "text-emerald-300" : "text-muted-foreground")}>
          {live ? "Operational" : "Extension offline"}
        </p>
      </div>
    </div>
  )
}
