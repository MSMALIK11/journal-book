"use client"

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
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
import type { ResearchResult } from "@/lib/trading/research"
import { HourWeekdayHeatmap } from "@/components/research/hour-weekday-heatmap"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const chartConfig: ChartConfig = {
  winRate: { label: "Win rate", color: "hsl(var(--chart-1))" },
  netPnl: { label: "Net P&L", color: "hsl(var(--chart-2))" },
}

type Props = {
  patterns: ResearchResult["patterns"]
}

export function MarketPatterns({ patterns }: Props) {
  const holdData = patterns.holdTimeBuckets
    .filter((b) => b.trades > 0)
    .map((b) => ({
      ...b,
      fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
    }))

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Session × instrument</CardTitle>
          <CardDescription>Combinations with at least 5 trades</CardDescription>
        </CardHeader>
        <CardContent>
          {patterns.sessionByInstrument.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Instrument</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Win %</TableHead>
                  <TableHead className="text-right">Net P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.sessionByInstrument.slice(0, 12).map((row) => (
                  <TableRow key={`${row.instrument}-${row.session}`}>
                    <TableCell className="font-medium">{row.instrument}</TableCell>
                    <TableCell>{row.sessionLabel}</TableCell>
                    <TableCell className="text-right">{row.trades}</TableCell>
                    <TableCell className="text-right">{row.winRate.toFixed(0)}%</TableCell>
                    <TableCell
                      className={`text-right ${row.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                    >
                      {currency.format(row.netPnl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Need more trades per session-instrument combo.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Hold time vs performance</CardTitle>
            <CardDescription>Win rate by how long you stay in trades</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart data={holdData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis tickLine={false} axisLine={false} unit="%" width={40} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
                  {holdData.map((entry) => (
                    <Cell key={entry.key} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Signal by session</CardTitle>
            <CardDescription>Which TV signals work in which session</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {patterns.signalBySession.length > 0 ? (
              patterns.signalBySession.slice(0, 8).map((row) => (
                <div key={`${row.signal}-${row.session}`} className="flex justify-between text-sm">
                  <span>
                    {row.signal} · {row.sessionLabel}
                  </span>
                  <span className={row.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    {currency.format(row.netPnl)} · {row.winRate.toFixed(0)}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No signal data with enough sample size.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <HourWeekdayHeatmap cells={patterns.hourHeatmap} />
    </div>
  )
}
