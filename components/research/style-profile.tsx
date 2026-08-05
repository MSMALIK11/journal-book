"use client"

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { StyleProfile } from "@/lib/trading/research"
import type { BucketStats } from "@/lib/trading/analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const chartConfig: ChartConfig = {
  winRate: { label: "Win rate", color: "hsl(var(--chart-1))" },
}

type Props = {
  profile: StyleProfile
  holdTimeBuckets?: BucketStats[]
}

export function StyleProfileCard({ profile, holdTimeBuckets = [] }: Props) {
  const holdData = holdTimeBuckets
    .filter((b) => b.trades > 0)
    .map((b) => ({
      ...b,
      fill: b.netPnl >= 0 ? "hsl(142 76% 36%)" : "hsl(0 84% 60%)",
    }))
  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Your trading style</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm leading-relaxed">{profile.summary}</p>
          <div className="flex flex-wrap gap-2">
            <BadgePill label={profile.holdStyleLabel} />
            <BadgePill label={`Median hold ${profile.medianHoldLabel}`} />
            <BadgePill label={profile.busiestSession} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Long trades" value={String(profile.longTrades)} sub={currency.format(profile.longPnl)} />
        <StatCard title="Short trades" value={String(profile.shortTrades)} sub={currency.format(profile.shortPnl)} />
        <StatCard
          title="Avg trades / day"
          value={profile.avgTradesPerDay.toFixed(1)}
          sub={`${profile.tradingDays} active days`}
        />
        <StatCard
          title="Net P&L"
          value={currency.format(profile.netPnl)}
          sub={`${profile.winRate.toFixed(0)}% win rate`}
        />
      </div>

      {profile.topInstruments.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top instruments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {profile.topInstruments.map((item) => (
              <div key={item.instrument} className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.instrument}</span>
                <span className={item.netPnl >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {currency.format(item.netPnl)} · {item.trades} trades
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {holdData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hold time vs win rate</CardTitle>
            <CardDescription>How long you hold trades and how often they win</CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
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
      ) : null}
    </div>
  )
}

function BadgePill({ label }: { label: string }) {
  return (
    <span className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground">
      {label}
    </span>
  )
}

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  )
}
