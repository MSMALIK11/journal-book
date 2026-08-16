"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Newspaper } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authFetch } from "@/lib/client-auth"
import {
  dayKey,
  groupEventsByDay,
  type EconomicEvent,
  type NewsImpact,
} from "@/lib/news/economic-calendar"
import { cn } from "@/lib/utils"

type DayFilter = "today" | "tomorrow" | "week"
type ImpactFilter = "all" | "High" | "Medium" | "Low"

const TIMEZONE = "Asia/Kolkata"
const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "NZD", "CHF", "CNY"]

const tabTriggerClass = "data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200"

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Unable to load news")
  return data as { events: EconomicEvent[]; fetchedAt?: string }
}

function formatTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso))
}

function todayKey(offsetDays = 0) {
  const today = dayKey(new Date().toISOString(), TIMEZONE)
  if (offsetDays === 0) return today
  const date = new Date(`${today}T12:00:00+05:30`)
  date.setDate(date.getDate() + offsetDays)
  return dayKey(date.toISOString(), TIMEZONE)
}

function impactDot(impact: NewsImpact) {
  if (impact === "High") return "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)]"
  if (impact === "Medium") return "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]"
  if (impact === "Holiday") return "bg-slate-400"
  return "bg-cyan-400/70"
}

function impactLabel(impact: NewsImpact) {
  if (impact === "High") return "text-rose-400"
  if (impact === "Medium") return "text-amber-300"
  if (impact === "Holiday") return "text-slate-400"
  return "text-cyan-300/80"
}

export function EconomicCalendar() {
  const [day, setDay] = useState<DayFilter>("today")
  const [impact, setImpact] = useState<ImpactFilter>("all")
  const [currency, setCurrency] = useState("all")
  const { data, error, isLoading, isValidating } = useSWR("/api/news", fetcher, {
    refreshInterval: 5 * 60_000,
  })

  const events = data?.events ?? []
  const today = todayKey()
  const tomorrow = todayKey(1)

  const filtered = useMemo(() => {
    return events.filter((event) => {
      const key = dayKey(event.date, TIMEZONE)
      if (day === "today" && key !== today) return false
      if (day === "tomorrow" && key !== tomorrow) return false
      if (impact !== "all" && event.impact !== impact) return false
      if (currency !== "all" && event.country !== currency) return false
      return true
    })
  }, [events, day, impact, currency, today, tomorrow])

  const groups = useMemo(() => groupEventsByDay(filtered, TIMEZONE), [filtered])
  const now = Date.now()
  const nextHigh = events.find(
    (event) => event.impact === "High" && new Date(event.date).getTime() >= now - 60_000,
  )
  const liveWindow = events.filter((event) => {
    const start = new Date(event.date).getTime()
    return start <= now && now - start < 15 * 60_000
  })

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <HudPanel className="p-5">
          <p className="hud-label">This week</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-100">{events.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Forex Factory events</p>
        </HudPanel>
        <HudPanel glow="red" className="p-5">
          <p className="hud-label">Next high impact</p>
          {nextHigh ? (
            <>
              <p className="mt-2 text-lg font-semibold text-rose-300">{nextHigh.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {nextHigh.country} · {formatTime(nextHigh.date)} IST
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No remaining high-impact events</p>
          )}
        </HudPanel>
        <HudPanel className="p-5">
          <p className="hud-label">Live window</p>
          <p className="mt-2 text-2xl font-semibold text-cyan-100">{liveWindow.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">Released in the last 15 minutes</p>
        </HudPanel>
      </div>

      <HudPanel className="px-4 py-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={day} onValueChange={(value) => setDay(value as DayFilter)}>
            <TabsList className="border border-cyan-400/20 bg-[#05070a]">
              <TabsTrigger value="today" className={tabTriggerClass}>Today</TabsTrigger>
              <TabsTrigger value="tomorrow" className={tabTriggerClass}>Tomorrow</TabsTrigger>
              <TabsTrigger value="week" className={tabTriggerClass}>This week</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Select value={impact} onValueChange={(value) => setImpact(value as ImpactFilter)}>
              <SelectTrigger className="w-[140px] border-cyan-400/20 bg-transparent">
                <SelectValue placeholder="Impact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All impact</SelectItem>
                <SelectItem value="High">High</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="Low">Low</SelectItem>
              </SelectContent>
            </Select>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-[140px] border-cyan-400/20 bg-transparent">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All currencies</SelectItem>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="border-cyan-400/20 text-xs text-cyan-300/80">
              Times in IST
            </Badge>
          </div>
        </div>
      </HudPanel>

      {isValidating ? <p className="text-xs text-cyan-300/70">Updating calendar…</p> : null}

      {error && !data ? (
        <HudPanel className="p-8 text-center text-rose-400">
          Failed to load economic news. Please try again.
        </HudPanel>
      ) : isLoading && !data ? (
        <HudPanel className="p-8 text-center text-muted-foreground">Loading this week’s calendar…</HudPanel>
      ) : groups.length === 0 ? (
        <HudPanel className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <Newspaper className="h-10 w-10 text-cyan-400/50" />
          <p className="font-medium">No events for this filter</p>
          <p className="text-sm text-muted-foreground">Try This week or clear the currency filter.</p>
          <Button
            variant="outline"
            className="border-cyan-400/30 text-cyan-200"
            onClick={() => {
              setDay("week")
              setImpact("all")
              setCurrency("all")
            }}
          >
            Show full week
          </Button>
        </HudPanel>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <HudPanel key={group.key}>
              <HudPanelHeader title={group.label} description={`${group.events.length} events`} />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-cyan-400/10 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium">Ccy</th>
                      <th className="px-4 py-3 font-medium">Impact</th>
                      <th className="px-4 py-3 font-medium">Event</th>
                      <th className="px-4 py-3 text-right font-medium">Actual</th>
                      <th className="px-4 py-3 text-right font-medium">Forecast</th>
                      <th className="px-4 py-3 text-right font-medium">Previous</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.events.map((event) => {
                      const start = new Date(event.date).getTime()
                      const isLive = start <= now && now - start < 15 * 60_000
                      const isUpcoming = start > now && start - now < 60 * 60_000
                      return (
                        <tr
                          key={event.id}
                          className={cn(
                            "border-b border-cyan-400/10 last:border-0",
                            isLive && "bg-rose-500/10",
                            !isLive && isUpcoming && "bg-cyan-400/5",
                          )}
                        >
                          <td className="whitespace-nowrap px-4 py-3 tabular-nums text-cyan-100">
                            {formatTime(event.date)}
                            {isLive ? (
                              <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-rose-400">
                                Live
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 font-semibold text-cyan-200">{event.country}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-2">
                              <span className={cn("h-2.5 w-2.5 rounded-full", impactDot(event.impact))} />
                              <span className={cn("text-xs font-medium", impactLabel(event.impact))}>
                                {event.impact}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-cyan-50">{event.title}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-emerald-400">
                            {event.actual || "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {event.forecast || "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {event.previous || "—"}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </HudPanel>
          ))}
        </div>
      )}
    </div>
  )
}
