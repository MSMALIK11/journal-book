"use client"

import { Layers } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatSessionDisplay } from "@/lib/trading/sessions"
import {
  explainZoneReason,
  zoneChipClass,
  zoneHeaderClass,
  zoneLabel,
  zoneOverallHeadline,
  type MomentZoneSnapshot,
  type ZoneBucketSnapshot,
  type ZoneThresholds,
} from "@/lib/trading/trade-zones"

function ZoneChip({
  label,
  snapshot,
  thresholds,
}: {
  label: string
  snapshot: ZoneBucketSnapshot
  thresholds: ZoneThresholds
}) {
  const reason =
    snapshot.zone !== "neutral"
      ? explainZoneReason(snapshot, snapshot.zone, thresholds)
      : `Only ${snapshot.trades} trades logged so far.`

  return (
    <div className={cn("rounded-lg border px-2.5 py-2", zoneChipClass(snapshot.zone))}>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xs font-semibold leading-snug mt-0.5">{snapshot.label}</p>
      {snapshot.zone !== "neutral" ? (
        <p className="text-[10px] mt-1 tabular-nums opacity-90">
          {snapshot.winRate.toFixed(0)}% · {snapshot.trades} trades
        </p>
      ) : null}
      <p className="text-[10px] mt-1 leading-snug opacity-85">{reason}</p>
    </div>
  )
}

type Props = {
  zones?: MomentZoneSnapshot | null
  loading?: boolean
}

export function TradingZonePanel({ zones, loading }: Props) {
  if (loading) {
    return (
      <div className="border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!zones) return null

  const headline = zoneOverallHeadline(
    zones.overallZone,
    zones.hour,
    zones.weekday,
    zones.session,
    zones.thresholds,
  )

  const sessionDisplay = formatSessionDisplay(zones.activeSessionKey)
  const overlapSession = zones.sessionTimeline.find((s) => s.key === "LondonNyOverlap")

  return (
    <div className="border-b px-3 py-3 space-y-2.5">
      <div className={cn("rounded-lg border px-3 py-2.5", zoneHeaderClass(zones.overallZone))}>
        <p className="text-sm font-semibold leading-snug">{headline.title}</p>
        <p className="text-[11px] opacity-90 mt-1 leading-relaxed">{headline.message}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <ZoneChip label="Hour" snapshot={zones.hour} thresholds={zones.thresholds} />
        <ZoneChip label="Day" snapshot={zones.weekday} thresholds={zones.thresholds} />
        <ZoneChip
          label="Session"
          snapshot={{ ...zones.session, label: sessionDisplay.name }}
          thresholds={zones.thresholds}
        />
      </div>

      {zones.isOverlapWindow && zones.activeSessionKey !== "LondonNyOverlap" && overlapSession ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 flex items-center gap-2",
            "bg-gradient-to-r from-orange-500/10 via-amber-400/15 to-sky-500/10 border-amber-400/40",
          )}
        >
          <Layers className="h-4 w-4 text-amber-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold">Overlap active</p>
            {overlapSession.zone !== "neutral" ? (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {overlapSession.winRate.toFixed(0)}% · {overlapSession.trades} trades ·{" "}
                {zoneLabel(overlapSession.zone)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
