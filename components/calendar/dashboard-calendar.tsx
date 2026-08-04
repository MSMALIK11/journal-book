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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type CalendarTrade = {
  entry_date: string
  net_pnl?: number | null
}

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

  const monthPnl = monthTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)

  return (
    <Card className="overflow-hidden rounded-2xl border-border/60 shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base">{format(currentMonth, "MMMM yyyy")}</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {monthTrades.length} trades ·{" "}
              <span className={monthPnl >= 0 ? "text-emerald-500" : "text-rose-500"}>
                {monthPnl > 0 ? "+" : ""}${monthPnl.toFixed(0)}
              </span>
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/calendar">
            Full calendar
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-7 border-b border-border/60 bg-muted/20">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
            <div
              key={day}
              className="py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
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
                  "relative min-h-16 border-b border-r border-border/50 p-2 sm:min-h-20",
                  index % 7 === 6 && "border-r-0",
                  !inMonth && "bg-muted/20",
                  inMonth && !result && "bg-card",
                  result?.pnl > 0 && "bg-emerald-500/[0.08]",
                  result?.pnl < 0 && "bg-rose-500/[0.08]",
                  result && result.pnl === 0 && "bg-amber-500/[0.08]",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md text-[11px] font-medium",
                    !inMonth && "text-muted-foreground/30",
                    isToday(day) && "bg-primary text-primary-foreground",
                  )}
                >
                  {format(day, "d")}
                </span>
                {inMonth && result && (
                  <div className="mt-1 hidden sm:block">
                    <p
                      className={cn(
                        "truncate text-[11px] font-semibold",
                        result.pnl > 0
                          ? "text-emerald-500"
                          : result.pnl < 0
                            ? "text-rose-500"
                            : "text-amber-500",
                      )}
                    >
                      {result.pnl > 0 ? "+" : ""}${result.pnl.toFixed(0)}
                    </p>
                    <p className="text-[9px] text-muted-foreground">{result.count} trade{result.count === 1 ? "" : "s"}</p>
                  </div>
                )}
                {inMonth && result && (
                  <span
                    className={cn(
                      "absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full sm:hidden",
                      result.pnl > 0 ? "bg-emerald-500" : result.pnl < 0 ? "bg-rose-500" : "bg-amber-500",
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
