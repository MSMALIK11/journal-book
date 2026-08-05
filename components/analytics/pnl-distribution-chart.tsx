"use client"

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { PnlDistributionBucket } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const chartConfig: ChartConfig = {
  count: { label: "Trades", color: "hsl(var(--chart-1))" },
}

type Props = {
  distribution: PnlDistributionBucket[]
}

export function PnlDistributionChart({ distribution }: Props) {
  const data = distribution.map((bucket) => ({
    ...bucket,
    fill:
      bucket.label.startsWith("-") || bucket.label.startsWith("<")
        ? "hsl(0 84% 60%)"
        : bucket.label.startsWith("$0")
          ? "hsl(var(--muted-foreground))"
          : "hsl(142 76% 36%)",
  }))

  const totalTrades = distribution.reduce((sum, bucket) => sum + bucket.count, 0)
  if (totalTrades === 0) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>P&amp;L distribution</CardTitle>
        <CardDescription>
          How many trades landed in each profit/loss bucket — spot outsized wins or losses
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[260px] w-full">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={64}
              fontSize={11}
            />
            <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, _name, item) => {
                    const payload = item.payload as PnlDistributionBucket
                    return (
                      <span>
                        {value} trades · {currency.format(payload.netPnl)} total
                      </span>
                    )
                  }}
                />
              }
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.bucket} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
