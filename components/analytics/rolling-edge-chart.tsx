"use client"

import { AlertTriangle } from "lucide-react"
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { Badge } from "@/components/ui/badge"
import { formatR, type RollingEdgePoint } from "@/lib/trading/analytics"

const chartConfig: ChartConfig = {
  expectancyR: { label: "Expectancy", color: "#22d3ee" },
}

type Props = {
  series: RollingEdgePoint[]
  overallExpectancyR: number | null
}

export function RollingEdgeChart({ series, overallExpectancyR }: Props) {
  if (series.length < 2) return null

  // Edge decay: the last three windows all sit below the overall expectancy.
  const tail = series.slice(-3)
  const edgeDecaying =
    overallExpectancyR !== null &&
    tail.length === 3 &&
    tail.every((p) => p.expectancyR !== null && p.expectancyR < overallExpectancyR)

  const last = series[series.length - 1]

  return (
    <HudPanel glow={edgeDecaying ? "red" : "cyan"}>
      <HudPanelHeader
        title="Rolling edge"
        description={`Expectancy in R over a 20-trade window — a falling line means the edge is fading`}
        action={
          edgeDecaying ? (
            <Badge variant="outline" className="border-rose-400/40 text-rose-400 text-[10px]">
              <AlertTriangle className="mr-1 h-3 w-3" />
              edge decaying
            </Badge>
          ) : null
        }
      />
      <div className="p-4">
        <div className="mb-2 text-xs text-muted-foreground">
          Current window:{" "}
          <span className={last.expectancyR !== null && last.expectancyR >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {formatR(last.expectancyR)}
          </span>{" "}
          · overall {formatR(overallExpectancyR)}
        </div>
        <ChartContainer config={chartConfig} className="h-[220px] w-full">
          <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tick={{ fontSize: 10 }}
              tickFormatter={(value: string) => {
                const d = new Date(value)
                return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              tick={{ fontSize: 10 }}
              tickFormatter={(v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}R`}
            />
            <ReferenceLine y={0} stroke="rgba(148,163,184,0.4)" strokeDasharray="4 4" />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const payload = item.payload as RollingEdgePoint
                    return (
                      <div className="flex flex-col gap-0.5">
                        <span>
                          {Number(value).toFixed(2)}R expectancy
                        </span>
                        <span className="text-muted-foreground">
                          {payload.winRate.toFixed(0)}% win · {payload.trades} trades
                        </span>
                      </div>
                    )
                  }}
                />
              }
            />
            <Line
              type="monotone"
              dataKey="expectancyR"
              stroke="var(--color-expectancyR)"
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ChartContainer>
      </div>
    </HudPanel>
  )
}
