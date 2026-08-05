"use client"

import { ExternalLink, Radio } from "lucide-react"
import useSWR from "swr"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Radio className="h-5 w-5" />
          Live Sync
        </CardTitle>
        <CardDescription>
          Controls how often the Live Sync page calls the server while the tab is open. This is
          separate from the Chrome extension poll interval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="live-sync-poll">Page auto-refresh interval</Label>
          <Select
            value={String(pollSeconds)}
            onValueChange={(value) => {
              const seconds = Number.parseInt(value, 10)
              setPollSeconds(seconds)
              setLiveSyncPollSeconds(seconds)
            }}
          >
            <SelectTrigger id="live-sync-poll" className="w-full max-w-md">
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
          <p className="text-xs text-muted-foreground">
            Stored in this browser as <code className="text-foreground">jb-live-sync-poll-seconds</code>.
            Polling runs only while the Live Sync tab is visible.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <p>
            Extension poll (TradingView tab):{" "}
            <span className="font-medium text-foreground">{extensionPollLabel}</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            Change in chrome://extensions → Journal Book Sync → Options
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
