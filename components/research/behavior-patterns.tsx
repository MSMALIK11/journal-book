"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { BehaviorStats, ResearchResult } from "@/lib/trading/research"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  behavior: BehaviorStats
  journal: ResearchResult["journal"]
}

export function BehaviorPatterns({ behavior, journal }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <BehaviorCard
          title="After a win"
          description="Next trade win rate"
          value={
            behavior.afterWinNextWinRate !== null
              ? `${behavior.afterWinNextWinRate.toFixed(0)}%`
              : "—"
          }
          sub={`Baseline ${behavior.baselineWinRate.toFixed(0)}% · ${behavior.afterWinSamples} samples`}
        />
        <BehaviorCard
          title="After a loss"
          description="Next trade win rate"
          value={
            behavior.afterLossNextWinRate !== null
              ? `${behavior.afterLossNextWinRate.toFixed(0)}%`
              : "—"
          }
          sub={`Baseline ${behavior.baselineWinRate.toFixed(0)}% · ${behavior.afterLossSamples} samples`}
          negative={
            behavior.afterLossNextWinRate !== null &&
            behavior.afterLossNextWinRate < behavior.baselineWinRate - 5
          }
        />
        <BehaviorCard
          title="Loss day recovery"
          description="Avg trades to recover"
          value={
            behavior.avgTradesToRecoverAfterLossDay !== null
              ? behavior.avgTradesToRecoverAfterLossDay.toFixed(1)
              : "—"
          }
          sub={`${behavior.lossDayRecoverySamples} loss days analyzed`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BehaviorCard
          title="Heavy days (3+ trades)"
          description="Average daily P&L"
          value={
            behavior.highDensityDayAvgPnl !== null
              ? currency.format(behavior.highDensityDayAvgPnl)
              : "—"
          }
          sub={`${behavior.highDensityDays} days`}
        />
        <BehaviorCard
          title="Light days (1–2 trades)"
          description="Average daily P&L"
          value={
            behavior.lowDensityDayAvgPnl !== null
              ? currency.format(behavior.lowDensityDayAvgPnl)
              : "—"
          }
          sub={`${behavior.lowDensityDays} days`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Journal patterns</CardTitle>
          <CardDescription>From manual trades with emotion, plan, and mistake tags</CardDescription>
        </CardHeader>
        <CardContent>
          {!journal.hasManualJournalData ? (
            <p className="text-sm text-muted-foreground">
              Add manual trades with journal fields for psychology insights. TradingView sync uses
              default values.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <JournalTable title="By emotion" rows={journal.byEmotion} />
              <JournalTable title="By mistake" rows={journal.byMistake} />
              <JournalTable title="Plan adherence" rows={journal.byFollowedPlan} />
              <JournalTable title="Confidence" rows={journal.byConfidence} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function BehaviorCard({
  title,
  description,
  value,
  sub,
  negative,
}: {
  title: string
  description: string
  value: string
  sub: string
  negative?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${negative ? "text-rose-600" : ""}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}

function JournalTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ label: string; trades: number; winRate: number; netPnl: number }>
}) {
  if (!rows.length) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">No data</p>
      </div>
    )
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead className="text-right">Trades</TableHead>
            <TableHead className="text-right">P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.label}>
              <TableCell>{row.label}</TableCell>
              <TableCell className="text-right">{row.trades}</TableCell>
              <TableCell
                className={`text-right ${row.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}`}
              >
                {currency.format(row.netPnl)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
