"use client"

import { ShieldCheck, TrendingDown, TrendingUp } from "lucide-react"
import { HudPanel } from "@/components/dashboard/hud-panel"
import { Sparkline, WinRateRing } from "@/components/dashboard/sparkline"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Props = {
  loading: boolean
  netPnl: number
  closedCount: number
  winRate: number
  averageRR: number
  worstTrade: number
  equitySpark: number[]
  lossSpark: number[]
}

export function CommandKpis({
  loading,
  netPnl,
  closedCount,
  winRate,
  averageRR,
  worstTrade,
  equitySpark,
  lossSpark,
}: Props) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <HudPanel glow={netPnl >= 0 ? "green" : "red"} className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="hud-label">Net P&amp;L</p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-28" />
            ) : (
              <p
                className={cn(
                  "mt-2 text-3xl font-semibold tracking-tight",
                  netPnl >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {netPnl >= 0 ? "+" : ""}
                {currency.format(netPnl)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">{closedCount} closed trades</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div
              className={cn(
                "rounded-lg p-2",
                netPnl >= 0 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400",
              )}
            >
              {netPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            </div>
            <Sparkline values={equitySpark} color={netPnl >= 0 ? "#34d399" : "#f43f5e"} />
          </div>
        </div>
      </HudPanel>

      <HudPanel className="p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="hud-label">Win Rate</p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tracking-tight text-cyan-300">{winRate.toFixed(1)}%</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Across closed trades</p>
          </div>
          <WinRateRing value={winRate} />
        </div>
      </HudPanel>

      <HudPanel className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="hud-label">Average R:R</p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tracking-tight text-violet-300">
                {averageRR ? `1:${averageRR.toFixed(2)}` : "—"}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">From stop and target</p>
          </div>
          <div className="rounded-lg bg-violet-500/10 p-2 text-violet-300">
            <ShieldCheck className="h-4 w-4" />
          </div>
        </div>
      </HudPanel>

      <HudPanel glow="red" className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="hud-label">Worst Trade</p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-20" />
            ) : (
              <p className="mt-2 text-3xl font-semibold tracking-tight text-rose-400">
                {currency.format(worstTrade)}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">Largest recorded loss</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="rounded-lg bg-rose-500/10 p-2 text-rose-400">
              <TrendingDown className="h-4 w-4" />
            </div>
            <Sparkline values={lossSpark} color="#f43f5e" />
          </div>
        </div>
      </HudPanel>
    </section>
  )
}
