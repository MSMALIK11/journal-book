"use client"

import { ExternalLink, Radio } from "lucide-react"
import useSWR from "swr"
import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SettingsHint, SettingsSection } from "@/components/settings/settings-section"
import { authFetch } from "@/lib/client-auth"
import {
  DEFAULT_LIVE_SYNC_POLL_SECONDS,
  formatLiveSyncPollLabel,
  getLiveSyncPollSeconds,
  LIVE_SYNC_POLL_OPTIONS,
  setLiveSyncPollSeconds,
} from "@/lib/live-sync-settings"

type SyncStatus = {
  poll_interval_seconds?: number
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data
}

export function LiveSyncSettings() {
  const [pollSeconds, setPollSeconds] = useState(DEFAULT_LIVE_SYNC_POLL_SECONDS)
  const { data: statusData } = useSWR<SyncStatus>("/api/sync/heartbeat", fetcher, {
    refreshInterval: 60_000,
  })

  useEffect(() => {
    setPollSeconds(getLiveSyncPollSeconds())
  }, [])

  const extensionPollSeconds = statusData?.poll_interval_seconds ?? 0
  const extensionPollLabel =
    extensionPollSeconds > 0
      ? formatLiveSyncPollLabel(extensionPollSeconds)
      : "Not reported yet"

  const pagePollLabel = formatLiveSyncPollLabel(pollSeconds)

  return (
    <SettingsSection
      id="live-sync"
      icon={Radio}
      iconTone="violet"
      title="Live Sync"
      description="How often the Live Sync page refreshes while open — separate from the Chrome extension."
      badge={
        <Badge variant="outline" className="text-[10px] font-normal">
          {pagePollLabel}
        </Badge>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 space-y-2.5">
          <Label htmlFor="live-sync-poll" className="text-sm font-medium">
            Page auto-refresh interval
          </Label>
          <Select
            value={String(pollSeconds)}
            onValueChange={(value) => {
              const seconds = Number.parseInt(value, 10)
              setPollSeconds(seconds)
              setLiveSyncPollSeconds(seconds)
            }}
          >
            <SelectTrigger id="live-sync-poll" className="w-full bg-background">
              <SelectValue placeholder="Choose interval" />
            </SelectTrigger>
            <SelectContent>
              {LIVE_SYNC_POLL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <SettingsHint>
            Stored in this browser. Instant updates use SSE when the extension syncs; this interval
            is a backup refresh while the Live Sync tab is visible.
          </SettingsHint>
        </div>

        <div className="rounded-xl border border-border/50 bg-gradient-to-br from-muted/20 to-muted/5 px-4 py-3.5">
          <p className="text-sm">
            <span className="text-muted-foreground">Extension poll (TradingView):</span>{" "}
            <span className="font-medium">{extensionPollLabel}</span>
          </p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            chrome://extensions → Journal Book Sync → Options
          </p>
        </div>
      </div>
    </SettingsSection>
  )
}
