"use client"

import Link from "next/link"
import { format, parseISO } from "date-fns"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"
import { ArrowRight, Globe2 } from "lucide-react"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { AnalyticsResult } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  loading: boolean
  analytics: AnalyticsResult | null
  symbol: string
  extensionLive: boolean
  recentAbsPnls: number[]
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number)
  if (!year || !month) return key
  return format(new Date(year, month - 1, 1), "MMM")
}

function volatilityFromPnls(values: number[]) {
  if (values.length < 4) return "MEDIUM"
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const last = values.slice(-8)
  const recent = last.reduce((sum, value) => sum + value, 0) / last.length
  if (avg <= 0) return "MEDIUM"
  if (recent > avg * 1.4) return "HIGH"
  if (recent < avg * 0.6) return "LOW"
  return "MEDIUM"
}

export function CommandCharts({ loading, analytics, symbol, extensionLive, recentAbsPnls }: Props) {
  const equity = (analytics?.equityCurve ?? []).map((point) => ({
    equity: point.equity,
    label: format(parseISO(point.date), "MMM d"),
  }))
  const peak = equity.at(-1)?.equity ?? 0
  const months = (analytics?.byMonth ?? []).slice(-6).map((month) => ({
    key: month.key,
    label: monthLabel(month.key),
    pnl: month.netPnl,
  }))
  const longTrades = analytics?.overview.longTrades ?? 0
  const shortTrades = analytics?.overview.shortTrades ?? 0
  const totalDir = longTrades + shortTrades
  const donut = [
    { name: "Long", value: longTrades, color: "#22d3ee" },
    { name: "Short", value: shortTrades, color: "#f43f5e" },
  ]
  const volatility = volatilityFromPnls(recentAbsPnls)
  const volWidth = volatility === "HIGH" ? "w-5/6" : volatility === "LOW" ? "w-1/3" : "w-3/5"

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <HudPanel glow="green" className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="hud-label">Equity Curve</p>
            <p className="mt-1 text-lg font-semibold text-emerald-400">{currency.format(peak)}</p>
          </div>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
            <Link href="/analytics">
              Open
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
        {loading ? (
          <Skeleton className="h-[140px] w-full" />
        ) : equity.length ? (
          <div className="h-[140px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equity} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={{ background: "#0d141c", border: "1px solid #1b2a36", borderRadius: 8 }}
                  formatter={(value) => currency.format(Number(value))}
                />
                <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={2} fill="url(#equityFill)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-muted-foreground">No closed trades to chart yet</p>
        )}
      </HudPanel>

      <HudPanel className="p-4">
        <p className="hud-label mb-3">Monthly Performance</p>
        {loading ? (
          <Skeleton className="h-[160px] w-full" />
        ) : months.length ? (
          <div className="h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 16, right: 4, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8b9cb3", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#0d141c", border: "1px solid #1b2a36", borderRadius: 8 }}
                  formatter={(value) => currency.format(Number(value))}
                />
                <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                  {months.map((month) => (
                    <Cell key={month.key} fill={month.pnl >= 0 ? "#34d399" : "#f43f5e"} />
                  ))}
                  <LabelList
                    dataKey="pnl"
                    position="top"
                    className="fill-muted-foreground text-[10px]"
                    formatter={(value: number) => (value >= 0 ? `+${Math.round(value)}` : `${Math.round(value)}`)}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-muted-foreground">No monthly data yet</p>
        )}
      </HudPanel>

      <HudPanel className="p-4">
        <p className="hud-label mb-1">Trade Distribution</p>
        {loading ? (
          <Skeleton className="mx-auto mt-4 h-32 w-32 rounded-full" />
        ) : totalDir ? (
          <div className="flex items-center gap-3">
            <div className="h-[140px] w-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={donut} dataKey="value" innerRadius={42} outerRadius={62} stroke="none" paddingAngle={2}>
                    {donut.map((slice) => (
                      <Cell key={slice.name} fill={slice.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2 text-xs">
              <p className="text-cyan-300">
                Long {longTrades} · {totalDir ? ((longTrades / totalDir) * 100).toFixed(0) : 0}%
              </p>
              <p className="text-rose-300">
                Short {shortTrades} · {totalDir ? ((shortTrades / totalDir) * 100).toFixed(0) : 0}%
              </p>
            </div>
          </div>
        ) : (
          <p className="py-10 text-center text-xs text-muted-foreground">No direction data yet</p>
        )}
      </HudPanel>

      <HudPanel className="p-4">
        <p className="hud-label mb-3">Market Status</p>
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 p-3 text-cyan-300">
            <Globe2 className="h-8 w-8" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-wide">{symbol || "MARKET"}</p>
            <p className={cn("text-xs font-semibold", extensionLive ? "text-emerald-400" : "text-amber-400")}>
              {extensionLive ? "ACTIVE" : "STANDBY"}
            </p>
          </div>
        </div>
        <div className="mt-5">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            <span>Volatility</span>
            <span className="text-cyan-300">{volatility}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-cyan-400", volWidth)} />
          </div>
        </div>
      </HudPanel>
    </section>
  )
}
