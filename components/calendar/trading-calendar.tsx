"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns"
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HudPanel } from "@/components/dashboard/hud-panel"
import useSWR from "swr"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { formatHoldDuration, getTradeHoldTimeMs } from "@/lib/trading/analytics"
import {
  formatTradePriceRange,
  formatTradeStartTime,
  getTradeSessionLabel,
  getTradeWindowFlags,
  shouldShowStrategyLabel,
  tradeSideLabel,
} from "@/lib/trading/trade-display"
import type { AnalyticsResult } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

type Trade = {
  id: string
  instrument: string
  trade_type: "Buy" | "Sell"
  entry_date: string
  exit_date?: string | null
  entry_price: number
  exit_price?: number
  quantity: number
  net_pnl: number | null
  strategy?: string
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function tradeDateKey(entryDate: string) {
  const parsed = parseISO(entryDate)
  if (!isValid(parsed)) return null
  return format(parsed, "yyyy-MM-dd")
}

function formatDayLabel(dateKey: string) {
  const parsed = parseISO(`${dateKey}T12:00:00`)
  if (!isValid(parsed)) return "—"
  return format(parsed, "EEE, MMM d")
}

export function TradingCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [trades, setTrades] = useState<Trade[]>([])
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const { activeAccountId, switchVersion } = useActiveAccount()

  const { data: profileData } = useSWR("/api/profile", async (url: string) => {
    const response = await authFetch(url)
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Failed to load profile")
    return data as { profile?: { timezone?: string } }
  })
  const timezone =
    profileData?.profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const { data: analytics } = useSWR<AnalyticsResult>(
    activeAccountId ? `/api/analytics?source=all&v=${switchVersion}` : null,
    async (url: string) => {
      const response = await authFetch(url)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to load analytics")
      return data as AnalyticsResult
    },
  )

  useEffect(() => {
    if (!activeAccountId) return
    const controller = new AbortController()

    async function loadTrades() {
      setLoading(true)
      setError("")
      const monthStart = format(startOfMonth(currentDate), "yyyy-MM-dd")
      const monthEnd = format(endOfMonth(currentDate), "yyyy-MM-dd")

      try {
        const response = await authFetch(
          `/api/trades?limit=1000&startDate=${monthStart}&endDate=${monthEnd}`,
          { signal: controller.signal },
        )
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Unable to load calendar trades")

        setTrades(data.trades ?? [])
        setSelectedDate(null)
      } catch (requestError) {
        if (controller.signal.aborted) return
        setTrades([])
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load calendar trades",
        )
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadTrades()

    return () => controller.abort()
  }, [currentDate, activeAccountId, switchVersion])

  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 }),
        end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 }),
      }),
    [currentDate],
  )

  const tradesByDate = useMemo(
    () =>
      trades.reduce<Record<string, Trade[]>>((acc, trade) => {
        const key = tradeDateKey(trade.entry_date)
        if (!key) return acc
        ;(acc[key] ??= []).push(trade)
        return acc
      }, {}),
    [trades],
  )

  const completedTrades = trades.filter((trade) => typeof trade.net_pnl === "number")
  const totalPnL = completedTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0)
  const winningTrades = completedTrades.filter((trade) => (trade.net_pnl ?? 0) > 0).length
  const losingTrades = completedTrades.filter((trade) => (trade.net_pnl ?? 0) < 0).length
  const breakEvenTrades = completedTrades.length - winningTrades - losingTrades
  const winRate = completedTrades.length ? (winningTrades / completedTrades.length) * 100 : 0

  const dailyResults = Object.entries(tradesByDate).map(([date, dayTrades]) => ({
    date,
    pnl: dayTrades.reduce((total, trade) => total + (trade.net_pnl ?? 0), 0),
  }))
  const bestDay = dailyResults.reduce<(typeof dailyResults)[number] | null>(
    (best, day) => (!best || day.pnl > best.pnl ? day : best),
    null,
  )
  const worstDay = dailyResults.reduce<(typeof dailyResults)[number] | null>(
    (worst, day) => (!worst || day.pnl < worst.pnl ? day : worst),
    null,
  )

  const selectedTrades = selectedDate
    ? tradesByDate[format(selectedDate, "yyyy-MM-dd")] ?? []
    : []
  const selectedPnL = selectedTrades.reduce(
    (total, trade) => total + (trade.net_pnl ?? 0),
    0,
  )

  const stats = [
    {
      label: "Net P&L",
      value: currency.format(totalPnL),
      detail: `${completedTrades.length} closed trades`,
      icon: totalPnL >= 0 ? TrendingUp : TrendingDown,
      positive: totalPnL >= 0,
    },
    {
      label: "Best day",
      value: bestDay ? currency.format(bestDay.pnl) : "—",
      detail: bestDay ? formatDayLabel(bestDay.date) : "No trades yet",
      icon: ArrowUpRight,
      positive: true,
    },
    {
      label: "Lowest day",
      value: worstDay ? currency.format(worstDay.pnl) : "—",
      detail: worstDay ? formatDayLabel(worstDay.date) : "No trades yet",
      icon: ArrowDownRight,
      positive: false,
    },
    {
      label: "Win rate",
      value: `${winRate.toFixed(0)}%`,
      detail: `${winningTrades}W · ${breakEvenTrades}B · ${losingTrades}L`,
      icon: Target,
      positive: winRate >= 50,
    },
  ]

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-500">
          {error}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <HudPanel
              key={stat.label}
              glow={stat.positive ? "green" : "red"}
              className="p-5"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="hud-label">{stat.label}</p>
                  <p
                    className={cn(
                      "mt-2 text-2xl font-semibold tracking-tight",
                      stat.value !== "—" &&
                        (stat.positive ? "text-emerald-400" : "text-rose-400"),
                    )}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
                </div>
                <div
                  className={cn(
                    "rounded-xl p-2.5",
                    stat.positive
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-rose-500/10 text-rose-400",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </HudPanel>
          )
        })}
      </div>

      <HudPanel>
        <div className="flex flex-col gap-4 border-b border-cyan-400/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-2.5 text-cyan-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Monthly performance</p>
              <p className="text-xs text-muted-foreground">Select a day to review its trades.</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 rounded-xl border border-cyan-400/20 bg-[#05070a] p-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              aria-label="Previous month"
              onClick={() => {
                setLoading(true)
                setCurrentDate((date) => subMonths(date, 1))
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <p className="min-w-36 text-center text-sm font-semibold">
              {format(currentDate, "MMMM yyyy")}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-lg"
              aria-label="Next month"
              onClick={() => {
                setLoading(true)
                setCurrentDate((date) => addMonths(date, 1))
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className={cn("min-w-[760px] transition-opacity", loading && "opacity-50")}>
            <div className="grid grid-cols-7 border-b border-cyan-400/10 bg-cyan-400/5">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
                <div
                  key={day}
                  className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => {
                const dateKey = format(day, "yyyy-MM-dd")
                const dayTrades = tradesByDate[dateKey] ?? []
                const pnl = dayTrades.reduce(
                  (total, trade) => total + (trade.net_pnl ?? 0),
                  0,
                )
                const hasTrades = dayTrades.length > 0
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const inMonth = isSameMonth(day, currentDate)

                return (
                  <button
                    key={dateKey}
                    type="button"
                    disabled={!inMonth}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "group relative min-h-28 border-b border-r border-cyan-400/10 p-3 text-left transition-colors",
                      index % 7 === 6 && "border-r-0",
                      !inMonth && "bg-[#05070a]/40 text-muted-foreground/30",
                      inMonth && !hasTrades && "hover:bg-cyan-400/5",
                      hasTrades && pnl > 0 && "bg-emerald-500/[0.08] hover:bg-emerald-500/[0.14]",
                      hasTrades && pnl < 0 && "bg-rose-500/[0.08] hover:bg-rose-500/[0.14]",
                      hasTrades && pnl === 0 && "bg-amber-500/[0.08] hover:bg-amber-500/[0.14]",
                      isSelected && "z-10 ring-2 ring-inset ring-cyan-400/60",
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span
                        className={cn(
                          "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-xs font-semibold",
                          isToday(day) && "bg-cyan-400 text-[#05070a]",
                          !isToday(day) && inMonth && "text-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      {hasTrades && (
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            pnl > 0 ? "bg-emerald-500" : pnl < 0 ? "bg-rose-500" : "bg-amber-500",
                          )}
                        />
                      )}
                    </div>

                    {hasTrades && (
                      <div className="mt-4">
                        <p
                          className={cn(
                            "text-sm font-semibold",
                            pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-rose-400" : "text-amber-400",
                          )}
                        >
                          {pnl > 0 && "+"}
                          {currency.format(pnl)}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {dayTrades.length} {dayTrades.length === 1 ? "trade" : "trades"}
                        </p>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-cyan-400/10 px-5 py-3 text-xs text-muted-foreground">
          {[
            ["bg-emerald-500", "Profitable"],
            ["bg-rose-500", "Loss"],
            ["bg-amber-500", "Break-even"],
          ].map(([color, label]) => (
            <div key={label} className="flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", color)} />
              {label}
            </div>
          ))}
        </div>
      </HudPanel>

      {selectedDate && (
        <HudPanel className="p-5">
          <div className="flex flex-col gap-3 border-b border-cyan-400/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{format(selectedDate, "EEEE, MMMM d")}</p>
              <p className="text-sm text-muted-foreground">
                {selectedTrades.length
                  ? `${selectedTrades.length} ${selectedTrades.length === 1 ? "trade" : "trades"} recorded`
                  : "No trades recorded"}
              </p>
            </div>
            {selectedTrades.length > 0 && (
              <div
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold",
                  selectedPnL > 0
                    ? "bg-emerald-500/10 text-emerald-400"
                    : selectedPnL < 0
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-amber-500/10 text-amber-400",
                )}
              >
                {selectedPnL > 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : selectedPnL < 0 ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <Minus className="h-4 w-4" />
                )}
                {selectedPnL > 0 && "+"}
                {currency.format(selectedPnL)}
              </div>
            )}
          </div>

          {selectedTrades.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {selectedTrades.map((trade) => {
                const holdMs = getTradeHoldTimeMs(trade)
                const startedLabel = formatTradeStartTime(trade.entry_date, timezone)
                const sessionLabel = getTradeSessionLabel(trade.entry_date, timezone)
                const windowFlags = getTradeWindowFlags(trade.entry_date, analytics?.avoid, timezone)
                return (
                <div key={trade.id} className="rounded-xl border border-cyan-400/15 bg-[#05070a]/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{trade.instrument}</p>
                    <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                      {tradeSideLabel(trade.trade_type)}
                    </Badge>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {trade.quantity} qty ·{" "}
                        {formatTradePriceRange(trade, (value) => currency.format(value))}
                      </p>
                      {shouldShowStrategyLabel(trade.strategy) && (
                        <p className="mt-1 text-xs text-muted-foreground">{trade.strategy}</p>
                      )}
                      {startedLabel && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            Started {startedLabel}
                            <span className="text-foreground/70"> · {sessionLabel}</span>
                            {holdMs !== null ? (
                              <> · Completed in {formatHoldDuration(holdMs)}</>
                            ) : (
                              <> · Open</>
                            )}
                          </span>
                        </p>
                      )}
                      {(windowFlags.weakHour || windowFlags.weakSession) && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {windowFlags.weakHour ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-rose-500/35 px-1.5 text-[10px] font-medium text-rose-500"
                            >
                              Weak hour
                            </Badge>
                          ) : null}
                          {windowFlags.weakSession ? (
                            <Badge
                              variant="outline"
                              className="h-5 border-rose-500/35 px-1.5 text-[10px] font-medium text-rose-500"
                            >
                              Weak session
                            </Badge>
                          ) : null}
                        </div>
                      )}
                    </div>
                    {trade.net_pnl !== null && (
                      <p
                        className={cn(
                          "text-sm font-semibold",
                          trade.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {trade.net_pnl > 0 && "+"}
                        {currency.format(trade.net_pnl)}
                      </p>
                    )}
                  </div>
                </div>
              )})}
            </div>
          )}
        </HudPanel>
      )}
    </div>
  )
}
