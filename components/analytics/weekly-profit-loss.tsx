"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { WeeklyBucket } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const chartConfig: ChartConfig = {
  netPnl: { label: "Net P&L", color: "hsl(var(--chart-1))" },
}

function WeekTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: WeeklyBucket }>
}) {
  if (!active || !payload?.length) return null
  const w = payload[0].payload
  return (
    <div className="rounded-lg border bg-background p-3 text-sm shadow-md">
      <p className="font-medium">{w.label}</p>
      <p className="text-muted-foreground">{w.trades} trades · {w.winRate.toFixed(0)}% win rate</p>
      <p className="text-emerald-600">Profit: {currency.format(w.grossProfit)}</p>
      <p className="text-rose-600">Loss: {currency.format(w.grossLoss)}</p>
      <p className={w.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
        Net: {currency.format(w.netPnl)}
      </p>
    </div>
  )
}

type Props = {
  byWeek: WeeklyBucket[]
}

export function WeeklyProfitLoss({ byWeek }: Props) {
  if (!byWeek.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly profit &amp; loss</CardTitle>
          <CardDescription>No closed trades to group by week</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const chartData = byWeek.map((w) => ({
    ...w,
    fill: w.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
  }))

  const totals = byWeek.reduce(
    (acc, w) => ({
      profit: acc.profit + w.grossProfit,
      loss: acc.loss + w.grossLoss,
      net: acc.net + w.netPnl,
    }),
    { profit: 0, loss: 0, net: 0 },
  )

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Weekly profit &amp; loss</h2>
        <p className="text-sm text-muted-foreground">
          P&amp;L grouped by calendar week (Mon–Sun, your timezone)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total weekly profit</CardDescription>
            <CardTitle className="text-xl text-emerald-600">{currency.format(totals.profit)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total weekly loss</CardDescription>
            <CardTitle className="text-xl text-rose-600">{currency.format(totals.loss)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net across weeks</CardDescription>
            <CardTitle className={`text-xl ${totals.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {currency.format(totals.net)}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly net P&amp;L</CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => currency.format(v)}
                width={72}
              />
              <ChartTooltip content={<WeekTooltip />} />
              <Bar dataKey="netPnl" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.key} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Week-by-week breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Week</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Profit</TableHead>
                <TableHead className="text-right">Loss</TableHead>
                <TableHead className="text-right">Net P&amp;L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byWeek].reverse().map((week) => (
                <TableRow key={week.key}>
                  <TableCell className="font-medium whitespace-nowrap">{week.label}</TableCell>
                  <TableCell className="text-right">{week.trades}</TableCell>
                  <TableCell className="text-right text-emerald-600">
                    {currency.format(week.grossProfit)}
                  </TableCell>
                  <TableCell className="text-right text-rose-600">
                    {currency.format(week.grossLoss)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${week.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    {currency.format(week.netPnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
