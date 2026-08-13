"use client"

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import type { StyleProfile } from "@/lib/trading/research"
import type { BucketStats } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const chartConfig: ChartConfig = {
  winRate: { label: "Win rate", color: "#22d3ee" },
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
      fill: b.netPnl >= 0 ? "#34d399" : "#f43f5e",
    }))
  return (
    <div className="space-y-4">
      <HudPanel className="px-5 py-4">
        <p className="hud-label mb-2">Your trading style</p>
        <p className="text-sm leading-relaxed text-cyan-100">{profile.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <BadgePill label={profile.holdStyleLabel} />
          <BadgePill label={`Median hold ${profile.medianHoldLabel}`} />
          <BadgePill label={profile.busiestSession} />
        </div>
      </HudPanel>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
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
          tone={profile.netPnl >= 0 ? "positive" : "negative"}
        />
      </div>

      {profile.topInstruments.length > 0 ? (
        <HudPanel>
          <HudPanelHeader title="Top instruments" />
          <div className="space-y-2 p-4">
            {profile.topInstruments.map((item) => (
              <div key={item.instrument} className="flex items-center justify-between text-sm">
                <span className="font-medium">{item.instrument}</span>
                <span className={item.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {currency.format(item.netPnl)} · {item.trades} trades
                </span>
              </div>
            ))}
          </div>
        </HudPanel>
      ) : null}

      {holdData.length > 0 ? (
        <HudPanel>
          <HudPanelHeader title="Hold time vs win rate" description="How long you hold trades and how often they win" />
          <div className="p-4">
            <ChartContainer config={chartConfig} className="h-[240px] w-full">
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
      ) : null}
    </div>
  )
}

function BadgePill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
      {label}
    </span>
  )
}

function StatCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string
  value: string
  sub: string
  tone?: "positive" | "negative"
}) {
  return (
    <HudPanel glow={tone === "positive" ? "green" : tone === "negative" ? "red" : "cyan"} className="p-5">
      <p className="hud-label">{title}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-semibold",
          tone === "positive" && "text-emerald-400",
          tone === "negative" && "text-rose-400",
          !tone && "text-cyan-100",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
    </HudPanel>
  )
}
