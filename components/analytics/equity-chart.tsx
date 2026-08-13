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
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
  equity: { label: "Equity", color: "#22d3ee" },
  drawdown: { label: "Drawdown", color: "#f43f5e" },
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
      <HudPanel className="p-5">
        <p className="text-sm font-semibold">Equity & Drawdown</p>
        <p className="mt-0.5 text-xs text-muted-foreground">No closed trades to chart yet</p>
      </HudPanel>
    )
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <HudPanel>
        <HudPanelHeader title="Equity Curve" description="Cumulative P&L by trade exit" />
        <div className="p-4">
          <ChartContainer config={equityConfig} className="h-[280px] w-full">
            <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
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
        </div>
      </HudPanel>

      <HudPanel glow="red">
        <HudPanelHeader
          title="Drawdown"
          description={`Max ${currency.format(maxDrawdown)} (${maxDrawdownPct.toFixed(1)}%)${
            maxDdPoint?.date ? ` · worst on ${format(parseISO(maxDdPoint.date), "MMM d, yyyy")}` : ""
          }`}
        />
        <div className="p-4">
          <ChartContainer config={equityConfig} className="h-[280px] w-full">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
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
        </div>
      </HudPanel>
    </div>
  )
}
