"use client"

import { Layers, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  zoneLabel,
  type MomentZoneSnapshot,
  type SessionTimelineItem,
  type TradeZone,
} from "@/lib/trading/trade-zones"

type Props = {
  zones?: MomentZoneSnapshot | null
  compact?: boolean
  activeOnly?: boolean
  className?: string
}

function zoneDotClass(zone: TradeZone) {
  switch (zone) {
    case "green":
      return "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]"
    case "yellow":
      return "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]"
    case "red":
      return "bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.5)]"
    default:
      return "bg-muted-foreground/50"
  }
}

function SessionSegment({
  item,
  overlap,
}: {
  item: SessionTimelineItem
  overlap?: boolean
}) {
  const tooltip =
    item.trades > 0
      ? `${item.label} · ${zoneLabel(item.zone)} · ${item.winRate.toFixed(0)}% · ${item.trades} trades`
      : item.label

  return (
    <div
      title={tooltip}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 min-h-[28px]",
        overlap && "bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-sky-500/10",
      )}
    >
      {overlap ? (
        <Layers className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
      ) : (
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", zoneDotClass(item.zone))} />
      )}
      <span className="text-[11px] font-medium leading-none whitespace-nowrap text-foreground/90">
        {item.shortLabel}
      </span>
      {item.tier === 5 ? (
        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
      ) : null}
    </div>
  )
}

function SessionChipGroup({
  active,
  overlapSession,
  showOverlap,
}: {
  active: SessionTimelineItem
  overlapSession?: SessionTimelineItem
  showOverlap: boolean
}) {
  return (
    <div
      className={cn(
        "inline-flex items-stretch overflow-hidden rounded-full border",
        "bg-background/90 backdrop-blur-sm shadow-sm",
        "border-border/80",
      )}
    >
      <SessionSegment item={active} />
      {showOverlap && overlapSession ? (
        <>
          <span className="w-px self-center h-3.5 bg-border/80" aria-hidden />
          <SessionSegment item={overlapSession} overlap />
        </>
      ) : null}
    </div>
  )
}

export function SessionTimeline({ zones, compact = false, activeOnly = false, className }: Props) {
  if (!zones?.sessionTimeline?.length) return null

  if (activeOnly) {
    const active =
      zones.sessionTimeline.find((item) => item.isActive) ??
      zones.sessionTimeline.find((item) => item.key === zones.activeSessionKey)
    if (!active) return null

    const overlapSession = zones.sessionTimeline.find((item) => item.key === "LondonNyOverlap")
    const showOverlap =
      Boolean(zones.isOverlapWindow && active.key !== "LondonNyOverlap" && overlapSession)

    return (
      <div className={cn("flex items-center", compact ? "scale-[0.98]" : "", className)}>
        <SessionChipGroup active={active} overlapSession={overlapSession} showOverlap={showOverlap} />
      </div>
    )
  }

  return null
}
