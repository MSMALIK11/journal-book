"use client"

import { format, parseISO } from "date-fns"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
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
import type { EquityPoint } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const equityConfig: ChartConfig = {
  equity: { label: "Equity", color: "hsl(var(--chart-1))" },
  drawdown: { label: "Drawdown", color: "hsl(var(--chart-2))" },
}

type Props = {
  equityCurve: EquityPoint[]
  maxDrawdown: number
  maxDrawdownPct: number
}

export function EquityChart({ equityCurve, maxDrawdown, maxDrawdownPct }: Props) {
  const chartData = equityCurve.map((point) => ({
    ...point,
    label: format(parseISO(point.date), "MMM d, yyyy"),
  }))

  const maxDdPoint = equityCurve.reduce(
    (best, p) => (p.drawdown > best.drawdown ? p : best),
    equityCurve[0] ?? { date: "", equity: 0, drawdown: 0, drawdownPct: 0 },
  )

  if (!chartData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Equity &amp; Drawdown</CardTitle>
          <CardDescription>No closed trades to chart yet</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Equity Curve</CardTitle>
          <CardDescription>Cumulative P&amp;L by trade exit</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={equityConfig} className="h-[280px] w-full">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => currency.format(v)}
                width={72}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => currency.format(Number(value))}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="equity"
                stroke="var(--color-equity)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Drawdown</CardTitle>
          <CardDescription>
            Max {currency.format(maxDrawdown)} ({maxDrawdownPct.toFixed(1)}%)
            {maxDdPoint?.date && (
              <> · worst on {format(parseISO(maxDdPoint.date), "MMM d, yyyy")}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={equityConfig} className="h-[280px] w-full">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                interval="preserveStartEnd"
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => currency.format(v)}
                width={72}
                reversed
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => currency.format(Number(value))}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="drawdown"
                stroke="var(--color-drawdown)"
                fill="var(--color-drawdown)"
                fillOpacity={0.25}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>
    </div>
  )
}
