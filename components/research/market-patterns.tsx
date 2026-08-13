"use client"

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
  winRate: { label: "Win rate", color: "#22d3ee" },
  netPnl: { label: "Net P&L", color: "#34d399" },
}

type Props = {
  patterns: ResearchResult["patterns"]
}

export function MarketPatterns({ patterns }: Props) {
  const holdData = patterns.holdTimeBuckets
    .filter((b) => b.trades > 0)
    .map((b) => ({
      ...b,
      fill: b.netPnl >= 0 ? "#34d399" : "#f43f5e",
    }))

  return (
    <div className="space-y-6">
      <HudPanel>
        <HudPanelHeader title="Session × instrument" description="Combinations with at least 5 trades" />
        <div className="p-4">
          {patterns.sessionByInstrument.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-cyan-400/10 hover:bg-transparent">
                  <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Instrument</TableHead>
                  <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Session</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Win %</TableHead>
                  <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net P&L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {patterns.sessionByInstrument.slice(0, 12).map((row) => (
                  <TableRow key={`${row.instrument}-${row.session}`} className="border-cyan-400/10 hover:bg-cyan-400/5">
                    <TableCell className="font-medium">{row.instrument}</TableCell>
                    <TableCell>{row.sessionLabel}</TableCell>
                    <TableCell className="text-right">{row.trades}</TableCell>
                    <TableCell className="text-right">{row.winRate.toFixed(0)}%</TableCell>
                    <TableCell
                      className={`text-right ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
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
        </div>
      </HudPanel>

      <div className="grid gap-6 lg:grid-cols-2">
        <HudPanel>
          <HudPanelHeader title="Hold time vs performance" description="Win rate by how long you stay in trades" />
          <div className="p-4">
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart data={holdData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
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
          </div>
        </HudPanel>

        <HudPanel>
          <HudPanelHeader title="Signal by session" description="Which TV signals work in which session" />
          <div className="space-y-2 p-4">
            {patterns.signalBySession.length > 0 ? (
              patterns.signalBySession.slice(0, 8).map((row) => (
                <div key={`${row.signal}-${row.session}`} className="flex justify-between text-sm">
                  <span>
                    {row.signal} · {row.sessionLabel}
                  </span>
                  <span className={row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {currency.format(row.netPnl)} · {row.winRate.toFixed(0)}%
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No signal data with enough sample size.</p>
            )}
          </div>
        </HudPanel>
      </div>

      <HourWeekdayHeatmap cells={patterns.hourHeatmap} />
    </div>
  )
}
