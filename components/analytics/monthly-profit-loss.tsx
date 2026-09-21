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
import type { MonthlyBucket } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

const chartConfig: ChartConfig = {
  netPnl: { label: "Net P&L", color: "#22d3ee" },
}

function formatReturnPct(value: number | null): string {
  if (value === null) return "—"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${value.toFixed(2)}%`
}

function MonthTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MonthlyBucket }>
}) {
  if (!active || !payload?.length) return null
  const m = payload[0].payload
  return (
    <div className="rounded-lg border border-cyan-400/20 bg-[#0b1016] p-3 text-sm shadow-md">
      <p className="font-medium text-cyan-100">{m.label}</p>
      <p className="text-muted-foreground">{m.trades} trades · {m.winRate.toFixed(0)}% win rate</p>
      <p className="text-emerald-400">Profit: {currency.format(m.grossProfit)}</p>
      <p className="text-rose-400">Loss: {currency.format(m.grossLoss)}</p>
      <p className={m.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
        Net: {currency.format(m.netPnl)}
      </p>
      <p className={m.returnPct !== null && m.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}>
        Return: {formatReturnPct(m.returnPct)}
        {m.returnTrades > 0 ? ` (${m.returnTrades} trades)` : ""}
      </p>
    </div>
  )
}

type Props = {
  byMonth: MonthlyBucket[]
}

export function MonthlyProfitLoss({ byMonth }: Props) {
  if (!byMonth.length) {
    return (
      <HudPanel className="p-5">
        <p className="text-sm font-semibold">Monthly profit & loss</p>
        <p className="mt-0.5 text-xs text-muted-foreground">No closed trades to group by month</p>
      </HudPanel>
    )
  }

  const chartData = byMonth.map((m) => ({
    ...m,
    fill: m.netPnl >= 0 ? "#34d399" : "#f43f5e",
  }))

  const totals = byMonth.reduce(
    (acc, m) => ({
      profit: acc.profit + m.grossProfit,
      loss: acc.loss + m.grossLoss,
      net: acc.net + m.netPnl,
    }),
    { profit: 0, loss: 0, net: 0 },
  )

  const monthsWithReturn = byMonth.filter((m) => m.returnPct !== null)
  const avgMonthlyReturn =
    monthsWithReturn.length > 0
      ? monthsWithReturn.reduce((sum, m) => sum + (m.returnPct ?? 0), 0) / monthsWithReturn.length
      : null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200/80">
          Monthly profit &amp; loss
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Earnings and compounded return % per calendar month (your timezone)
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <HudPanel glow="green" className="p-5">
          <p className="hud-label">Total monthly profit</p>
          <p className="mt-2 text-xl font-semibold text-emerald-400">{currency.format(totals.profit)}</p>
        </HudPanel>
        <HudPanel glow="red" className="p-5">
          <p className="hud-label">Total monthly loss</p>
          <p className="mt-2 text-xl font-semibold text-rose-400">{currency.format(totals.loss)}</p>
        </HudPanel>
        <HudPanel glow={totals.net >= 0 ? "green" : "red"} className="p-5">
          <p className="hud-label">Net across months</p>
          <p className={`mt-2 text-xl font-semibold ${totals.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            {currency.format(totals.net)}
          </p>
        </HudPanel>
        <HudPanel glow="cyan" className="p-5">
          <p className="hud-label">Avg monthly return</p>
          <p
            className={`mt-2 text-xl font-semibold ${
              avgMonthlyReturn === null
                ? "text-muted-foreground"
                : avgMonthlyReturn >= 0
                  ? "text-emerald-400"
                  : "text-rose-400"
            }`}
          >
            {avgMonthlyReturn === null ? "—" : formatReturnPct(avgMonthlyReturn)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {monthsWithReturn.length > 0
              ? `From ${monthsWithReturn.length} month${monthsWithReturn.length === 1 ? "" : "s"} with return data`
              : "Re-import trades for return %"}
          </p>
        </HudPanel>
      </div>

      <HudPanel>
        <HudPanelHeader title="Monthly net P&L" />
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
              <ChartTooltip content={<MonthTooltip />} />
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
        <HudPanelHeader title="Month-by-month breakdown" />
        <div className="overflow-x-auto p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-cyan-400/10 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Month</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Earned</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Return %</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Win %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...byMonth].reverse().map((month) => (
                <TableRow key={month.key} className="border-cyan-400/10 hover:bg-cyan-400/5">
                  <TableCell className="font-medium whitespace-nowrap">{month.label}</TableCell>
                  <TableCell className="text-right">{month.trades}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${month.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {currency.format(month.netPnl)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      month.returnPct === null
                        ? "text-muted-foreground"
                        : month.returnPct >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {formatReturnPct(month.returnPct)}
                  </TableCell>
                  <TableCell className="text-right">{month.winRate.toFixed(1)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </HudPanel>
    </div>
  )
}
