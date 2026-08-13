"use client"

import Link from "next/link"
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ArrowRight, CalendarDays } from "lucide-react"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CalendarTrade = {
  entry_date: string
  net_pnl?: number | null
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

export function DashboardCalendar({ trades }: { trades: CalendarTrade[] }) {
  const currentMonth = new Date()
  const monthStart = startOfMonth(currentMonth)
  const monthEnd = endOfMonth(currentMonth)
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart, { weekStartsOn: 1 }),
    end: endOfWeek(monthEnd, { weekStartsOn: 1 }),
  })

  const monthTrades = trades.filter((trade) => {
    const date = trade.entry_date.slice(0, 10)
    return date >= format(monthStart, "yyyy-MM-dd") && date <= format(monthEnd, "yyyy-MM-dd")
  })

  const byDate = monthTrades.reduce<Record<string, { pnl: number; count: number }>>((result, trade) => {
    const date = trade.entry_date.slice(0, 10)
    result[date] ??= { pnl: 0, count: 0 }
    result[date].pnl += trade.net_pnl ?? 0
    result[date].count += 1
    return result
  }, {})

  const closed = monthTrades.filter((trade) => typeof trade.net_pnl === "number")
  const wins = closed.filter((trade) => (trade.net_pnl ?? 0) > 0)
  const losses = closed.filter((trade) => (trade.net_pnl ?? 0) < 0)
  const monthPnl = closed.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
  const grossProfit = wins.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
  const grossLoss = Math.abs(losses.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0))
  const bestTrade = wins.length ? Math.max(...wins.map((trade) => trade.net_pnl ?? 0)) : 0
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const expectancy = closed.length ? monthPnl / closed.length : 0

  const strip = [
    { label: "Total Trades", value: String(closed.length) },
    { label: "Winning", value: `${wins.length} (${closed.length ? Math.round((wins.length / closed.length) * 100) : 0}%)` },
    { label: "Losing", value: `${losses.length} (${closed.length ? Math.round((losses.length / closed.length) * 100) : 0}%)` },
    { label: "Best Trade", value: bestTrade ? `+${money.format(bestTrade)}` : "—" },
    { label: "Profit Factor", value: Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "∞" },
    { label: "Expectancy", value: money.format(expectancy) },
  ]

  return (
    <HudPanel className="overflow-hidden">
      <div className="flex items-center justify-between border-b border-cyan-400/10 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-2 text-cyan-300">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">{format(currentMonth, "MMMM yyyy")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {monthTrades.length} trades ·{" "}
              <span className={monthPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                {monthPnl > 0 ? "+" : ""}
                {money.format(monthPnl)}
              </span>
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm" className="text-cyan-300 hover:text-cyan-200">
          <Link href="/calendar">
            Full calendar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b border-cyan-400/10 bg-cyan-400/[0.03]">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <div
            key={day}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const dateKey = format(day, "yyyy-MM-dd")
          const result = byDate[dateKey]
          const inMonth = isSameMonth(day, currentMonth)

          return (
            <div
              key={dateKey}
              className={cn(
                "relative min-h-16 border-b border-r border-cyan-400/10 p-2 sm:min-h-[5.25rem]",
                index % 7 === 6 && "border-r-0",
                !inMonth && "opacity-30",
                result?.pnl > 0 && "bg-emerald-500/10",
                result?.pnl < 0 && "bg-rose-500/10",
                result && result.pnl === 0 && "bg-amber-500/10",
              )}
            >
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-medium",
                  !inMonth && "text-muted-foreground/40",
                  isToday(day) && "bg-cyan-400 text-cyan-950",
                )}
              >
                {format(day, "d")}
              </span>
              {inMonth && result ? (
                <div className="mt-1 hidden sm:block">
                  <p
                    className={cn(
                      "truncate text-[11px] font-semibold",
                      result.pnl > 0 ? "text-emerald-400" : result.pnl < 0 ? "text-rose-400" : "text-amber-400",
                    )}
                  >
                    {result.pnl > 0 ? "+" : ""}
                    {money.format(result.pnl)}
                  </p>
                  <p className="text-[9px] text-muted-foreground">
                    {result.count} trade{result.count === 1 ? "" : "s"}
                  </p>
                </div>
              ) : null}
              {inMonth && result ? (
                <span
                  className={cn(
                    "absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full sm:hidden",
                    result.pnl > 0 ? "bg-emerald-400" : result.pnl < 0 ? "bg-rose-400" : "bg-amber-400",
                  )}
                />
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-cyan-400/10 bg-cyan-400/10 sm:grid-cols-3 xl:grid-cols-6">
        {strip.map((item) => (
          <div key={item.label} className="bg-card/90 px-3 py-3">
            <p className="hud-label">{item.label}</p>
            <p className="mt-1 text-sm font-semibold">{item.value}</p>
          </div>
        ))}
      </div>
    </HudPanel>
  )
}
