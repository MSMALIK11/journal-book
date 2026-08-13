"use client"

import { Fragment } from "react"
import { cn } from "@/lib/utils"
import type { HeatmapCell } from "@/lib/trading/research"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { WEEKDAY_ORDER } from "@/lib/trading/sessions"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  cells: HeatmapCell[]
}

export function HourWeekdayHeatmap({ cells }: Props) {
  const maxAbsPnl = Math.max(
    ...cells.filter((c) => c.trades > 0).map((c) => Math.abs(c.netPnl)),
    1,
  )

  function cellColor(cell: HeatmapCell) {
    if (cell.trades === 0) return "bg-cyan-400/5"
    const intensity = Math.min(Math.abs(cell.netPnl) / maxAbsPnl, 1)
    if (cell.netPnl > 0) {
      return intensity > 0.6 ? "bg-emerald-500/70" : "bg-emerald-500/30"
    }
    return intensity > 0.6 ? "bg-rose-500/70" : "bg-rose-500/30"
  }

  return (
    <HudPanel>
      <HudPanelHeader
        title="Hour × weekday heatmap"
        description="Green = profitable hours, red = losing hours (darker = larger P&L)"
      />
      <div className="overflow-x-auto p-4">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[48px_repeat(24,minmax(0,1fr))] gap-0.5 text-[10px]">
            <div />
            {Array.from({ length: 24 }, (_, hour) => (
              <div key={hour} className="text-center text-muted-foreground">
                {hour}
              </div>
            ))}
            {WEEKDAY_ORDER.map((weekday) => (
              <Fragment key={weekday}>
                <div className="flex items-center font-medium text-muted-foreground">{weekday}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = cells.find((c) => c.weekday === weekday && c.hour === hour)!
                  return (
                    <div
                      key={`${weekday}-${hour}`}
                      title={
                        cell.trades > 0
                          ? `${weekday} ${hour}:00 · ${cell.trades} trades · ${currency.format(cell.netPnl)}`
                          : "No trades"
                      }
                      className={cn(
                        "aspect-square rounded-sm border border-cyan-400/10",
                        cellColor(cell),
                      )}
                    />
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    </HudPanel>
  )
}
