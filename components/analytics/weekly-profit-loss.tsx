"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
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
  netPnl: { label: "Net P&L", color: "#22d3ee" },
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
    <div className="rounded-lg border border-cyan-400/20 bg-[#0b1016] p-3 text-sm shadow-md">
      <p className="font-medium text-cyan-100">{w.label}</p>
      <p className="text-muted-foreground">{w.trades} trades · {w.winRate.toFixed(0)}% win rate</p>
      <p className="text-emerald-400">Profit: {currency.format(w.grossProfit)}</p>
      <p className="text-rose-400">Loss: {currency.format(w.grossLoss)}</p>
      <p className={w.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
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
      <HudPanel className="p-5">
        <p className="text-sm font-semibold">Weekly profit & loss</p>
        <p className="mt-0.5 text-xs text-muted-foreground">No closed trades to group by week</p>
      </HudPanel>
    )
  }

  const chartData = byWeek.map((w) => ({
    ...w,
    fill: w.netPnl >= 0 ? "#34d399" : "#f43f5e",
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
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
          Weekly profit &amp; loss
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          P&amp;L grouped by calendar week (Mon–Sun, your timezone)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <HudPanel glow="green" className="p-5">
          <p className="hud-label">Total weekly profit</p>
          <p className="mt-2 text-xl font-semibold text-emerald-400">{currency.format(totals.profit)}</p>
        </HudPanel>
        <HudPanel glow="red" className="p-5">
          <p className="hud-label">Total weekly loss</p>
          <p className="mt-2 text-xl font-semibold text-rose-400">{currency.format(totals.loss)}</p>
        </HudPanel>
        <HudPanel glow={totals.net >= 0 ? "green" : "red"} className="p-5">
          <p className="hud-label">Net across weeks</p>
          <p className={`mt-2 text-xl font-semibold ${totals.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {currency.format(totals.net)}
          </p>
        </HudPanel>
      </div>

      <HudPanel>
        <HudPanelHeader title="Weekly net P&L" />
        <div className="p-4">
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(34,211,238,0.08)" />
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
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader title="Week-by-week breakdown" />
        <div className="overflow-x-auto p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-cyan-400/10 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Week</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Profit</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Loss</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net P&amp;L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byWeek].reverse().map((week) => (
                <TableRow key={week.key} className="border-cyan-400/10 hover:bg-cyan-400/5">
                  <TableCell className="font-medium whitespace-nowrap">{week.label}</TableCell>
                  <TableCell className="text-right">{week.trades}</TableCell>
                  <TableCell className="text-right text-emerald-400">
                    {currency.format(week.grossProfit)}
                  </TableCell>
                  <TableCell className="text-right text-rose-400">
                    {currency.format(week.grossLoss)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${week.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {currency.format(week.netPnl)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </HudPanel>
    </div>
  )
}
