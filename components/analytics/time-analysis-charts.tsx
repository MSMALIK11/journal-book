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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { BucketStats } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const pnlConfig: ChartConfig = {
  netPnl: { label: "Net P&L", color: "hsl(var(--chart-1))" },
  winRate: { label: "Win rate", color: "hsl(var(--chart-3))" },
}

function BucketTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: BucketStats }> }) {
  if (!active || !payload?.length) return null
  const b = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="font-medium">{b.label}</p>
      <p className="text-muted-foreground">{b.trades} trades</p>
      <p>Win rate: {b.winRate.toFixed(1)}%</p>
      <p className={b.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
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
}

export function TimeAnalysisCharts({ byHour, byWeekday, byMonth, bySession }: Props) {
  const hourData = byHour.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
  }))

  const weekdayData = byWeekday.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
  }))

  const monthData = byMonth.map((b) => ({
    ...b,
    fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
  }))

  const sessionData = bySession
    .filter((b) => b.trades > 0)
    .map((b) => ({
      ...b,
      fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
    }))

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hour-wise P&amp;L</CardTitle>
            <CardDescription>Entry hour performance (your timezone)</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <BarChart data={hourData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Day of week</CardTitle>
            <CardDescription>Which weekdays make or lose money</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <BarChart data={weekdayData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly P&amp;L</CardTitle>
            <CardDescription>Seasonality across backtest period</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <ComposedChart data={monthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Session breakdown</CardTitle>
            <CardDescription>Asia / London / New York / Overlap</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={pnlConfig} className="h-[280px] w-full">
              <BarChart data={sessionData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={0}
                  angle={-12}
                  textAnchor="end"
                  height={56}
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
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
