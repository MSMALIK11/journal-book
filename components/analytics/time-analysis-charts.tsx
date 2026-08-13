"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import type { BucketStats } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const POS = "#34d399"
const NEG = "#f43f5e"

const pnlConfig: ChartConfig = {
  netPnl: { label: "Net P&L", color: "#22d3ee" },
  winRate: { label: "Win rate", color: "#22d3ee" },
}

function BucketTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BucketStats }> }) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-[#0b1016] p-3 text-sm shadow-md">
      <p className="font-medium text-cyan-100">{b.label}</p>
      <p className="text-muted-foreground">{b.trades} trades</p>
      <p>Win rate: {b.winRate.toFixed(1)}%</p>
      <p className={b.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
        Net P&amp;L: {currency.format(b.netPnl)}
      </p>
      <p>Avg P&amp;L: {currency.format(b.avgPnl)}</p>
    </div>
  )
}

type Props = {
  byHour: BucketStats[]
  byWeekday: BucketStats[]
  byMonth: BucketStats[]
  bySession: BucketStats[]
  hideMonthly?: boolean
}

export function TimeAnalysisCharts({ byHour, byWeekday, byMonth, bySession, hideMonthly = false }: Props) {
  const hourData = byHour.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? POS : NEG,
  }))

  const weekdayData = byWeekday.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? POS : NEG,
  }))

  const monthData = byMonth.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? POS : NEG,
  }))

  const sessionData = bySession
    .filter((b) => b.trades > 0)
    .map((b) => {
      const [name, time] = b.label.includes(" · ") ? b.label.split(" · ") : [b.label, ""]
      return {
        ...b,
        name,
        time,
        chartLabel: name,
        fill: b.netPnl >= 0 ? POS : NEG,
      }
    })

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <HudPanel>
          <HudPanelHeader title="Hour-wise P&L" description="Entry hour performance (your timezone)" />
          <div className="p-4">
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <BarChart data={hourData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => currency.format(v)} width={64} />
                <ChartTooltip content={<BucketTooltip />} />
                <Bar dataKey="netPnl" radius={[2, 2, 0, 0]}>
                  {hourData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </HudPanel>

        <HudPanel>
          <HudPanelHeader title="Day of week" description="Which weekdays make or lose money" />
          <div className="p-4">
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <BarChart data={weekdayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => currency.format(v)} width={64} />
                <ChartTooltip content={<BucketTooltip />} />
                <Bar dataKey="netPnl" radius={[4, 4, 0, 0]}>
                  {weekdayData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </HudPanel>
      </div>

      <div className={hideMonthly ? "grid gap-6" : "grid gap-6 lg:grid-cols-2"}>
        {!hideMonthly ? (
        <HudPanel>
          <HudPanelHeader title="Monthly P&L" description="Seasonality across backtest period" />
          <div className="p-4">
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <ComposedChart data={monthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  yAxisId="pnl"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => currency.format(v)}
                  width={64}
                />
                <YAxis
                  yAxisId="wr"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `${v}%`}
                  width={48}
                />
                <ChartTooltip content={<BucketTooltip />} />
                <Bar yAxisId="pnl" dataKey="netPnl" radius={[4, 4, 0, 0]}>
                  {monthData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
                <Line
                  yAxisId="wr"
                  type="monotone"
                  dataKey="winRate"
                  stroke="var(--color-winRate)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ChartContainer>
          </div>
        </HudPanel>
        ) : null}

        <HudPanel>
          <HudPanelHeader title="Session breakdown" description="Pre Asia → Asia → London → NY → Dead Zone" />
          <div className="p-4">
            <ChartContainer config={pnlConfig} className="h-[320px] w-full">
              <BarChart data={sessionData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
                <XAxis
                  dataKey="chartLabel"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={72}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => currency.format(v)} width={64} />
                <ChartTooltip content={<BucketTooltip />} />
                <Bar dataKey="netPnl" radius={[4, 4, 0, 0]}>
                  {sessionData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </HudPanel>
      </div>
    </div>
  )
}
