"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { format, subDays } from "date-fns"
import Link from "next/link"
import { AlertTriangle, BarChart3, Layers } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { KpiCard } from "@/components/analytics/analytics-dashboard"
import { EquityChart } from "@/components/analytics/equity-chart"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import {
  formatHoldDuration,
  formatProfitFactor,
  formatR,
  type AnalyticsResult,
} from "@/lib/trading/analytics"
import type { ExposureSummary, PortfolioAccountRow } from "@/lib/trading/portfolio-analytics"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type RangePreset = "30d" | "90d" | "all"

type PortfolioPayload = {
  merged: AnalyticsResult
  perAccount: PortfolioAccountRow[]
  exposure: ExposureSummary
  timezone: string
  accountCount: number
  accountsSkipped: number
  meta: { truncated: boolean; fetched: number; limit: number; accountsCapped: boolean }
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as PortfolioPayload
}

function rangeToDates(preset: RangePreset): { startDate?: string; endDate?: string } {
  if (preset === "all") return {}
  const days = preset === "30d" ? 30 : 90
  return {
    startDate: format(subDays(new Date(), days), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  }
}

export function PortfolioAnalyticsDashboard() {
  const { switchVersion } = useActiveAccount()
  const [range, setRange] = useState<RangePreset>("all")

  const query = useMemo(() => {
    const params = new URLSearchParams()
    const { startDate, endDate } = rangeToDates(range)
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    const qs = params.toString()
    return qs ? `/api/analytics/portfolio?${qs}` : "/api/analytics/portfolio"
  }, [range])

  const { data, error, isLoading } = useSWR<PortfolioPayload>(
    [query, switchVersion],
    ([url]) => fetcher(url),
    { keepPreviousData: true },
  )

  if (isLoading && !data) {
    return (
      <HudPanel className="flex items-center gap-3 p-8 text-sm text-muted-foreground">
        <BarChart3 className="h-5 w-5 animate-pulse" />
        Aggregating every account…
      </HudPanel>
    )
  }

  if (error && !data) {
    return (
      <HudPanel className="p-8 text-center text-rose-400">
        Failed to load portfolio analytics. Please try again.
      </HudPanel>
    )
  }

  if (!data?.merged || data.merged.overview.closedTrades === 0) {
    return (
      <div className="space-y-6">
        <RangeBar range={range} setRange={setRange} />
        <HudPanel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <Layers className="h-12 w-12 text-cyan-400/50" />
          <div>
            <p className="font-medium">No closed trades across your accounts</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Sync trades to any account, then return here for the combined view.
            </p>
          </div>
          <Button asChild variant="outline" className="border-cyan-400/30 text-cyan-200">
            <Link href="/live-sync">Go to Live Sync</Link>
          </Button>
        </HudPanel>
      </div>
    )
  }

  const overview = data.merged.overview
  const sumNetPnl = data.perAccount.reduce((s, a) => s + a.netPnl, 0)
  // Merged nets must equal the sum of per-account nets or grouping/attribution is off.
  const reconciles = Math.abs(sumNetPnl - overview.netPnl) < 0.5
  const sumCapital = data.perAccount.reduce((s, a) => s + (a.initialCapital ?? 0), 0)

  return (
    <div className="space-y-6">
      <RangeBar range={range} setRange={setRange} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-cyan-400/20 text-cyan-300/80">
          {data.accountCount} account{data.accountCount === 1 ? "" : "s"}
        </Badge>
        <Badge
          variant="outline"
          className={
            reconciles
              ? "border-emerald-400/30 text-emerald-400"
              : "border-amber-400/40 text-amber-300"
          }
        >
          {reconciles ? (
            "Per-account P&L sums to merged total"
          ) : (
            <>
              <AlertTriangle className="mr-1 h-3 w-3" />
              Sum {currency.format(sumNetPnl)} ≠ merged {currency.format(overview.netPnl)}
            </>
          )}
        </Badge>
        {data.accountsSkipped > 0 ? (
          <Badge variant="outline" className="border-amber-400/30 text-amber-300">
            <AlertTriangle className="mr-1 h-3 w-3" />
            {data.accountsSkipped} account{data.accountsSkipped === 1 ? "" : "s"} not swept
          </Badge>
        ) : null}
        {data.meta.truncated ? (
          <Badge variant="outline" className="border-amber-400/30 text-amber-300">
            <AlertTriangle className="mr-1 h-3 w-3" />
            First {data.meta.fetched.toLocaleString()} trades only
          </Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Net P&L"
          value={currency.format(overview.netPnl)}
          subtitle={`${overview.closedTrades} closed trades`}
          positive={overview.netPnl >= 0}
          negative={overview.netPnl < 0}
        />
        <KpiCard
          title="Win Rate"
          value={`${overview.winRate.toFixed(1)}%`}
          subtitle={`${overview.wins}W / ${overview.losses}L`}
        />
        <KpiCard
          title="Profit Factor"
          value={formatProfitFactor(overview.profitFactor)}
          subtitle="Gross profit ÷ gross loss"
        />
        <KpiCard
          title="Expectancy R"
          value={overview.r ? formatR(overview.r.expectancyR) : "—"}
          subtitle={overview.r ? `Over ${overview.r.sampleSize} trades` : "No usable R basis"}
          positive={!!overview.r && overview.r.expectancyR > 0}
          negative={!!overview.r && overview.r.expectancyR < 0}
        />
      </div>

      <ExposureCard exposure={data.exposure} />

      <HudPanel>
        <HudPanelHeader
          title="Accounts"
          description="Each account keeps its own capital basis for return % and drawdown %"
        />
        <div className="overflow-x-auto p-4">
          <Table>
            <TableHeader>
              <TableRow className="border-cyan-400/10 hover:bg-transparent">
                <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Account</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Win %</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net P&amp;L</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Expectancy R</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Max DD %</TableHead>
                <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Capital basis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.perAccount.map((row) => (
                <TableRow key={row.accountId} className="border-cyan-400/10 hover:bg-cyan-400/5">
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-right">{row.closedTrades}</TableCell>
                  <TableCell className="text-right">{row.winRate.toFixed(1)}%</TableCell>
                  <TableCell
                    className={`text-right ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {currency.format(row.netPnl)}
                  </TableCell>
                  <TableCell
                    className={`text-right ${
                      row.expectancyR == null
                        ? "text-muted-foreground"
                        : row.expectancyR >= 0
                          ? "text-emerald-400"
                          : "text-rose-400"
                    }`}
                  >
                    {formatR(row.expectancyR)}
                  </TableCell>
                  <TableCell className="text-right text-rose-300">
                    {row.maxDrawdownPct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {row.initialCapital != null ? currency.format(row.initialCapital) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </HudPanel>

      <EquityChart
        equityCurve={data.merged.equityCurve}
        maxDrawdown={overview.maxDrawdown}
        maxDrawdownPct={overview.maxDrawdownPct}
        initialCapital={sumCapital > 0 ? sumCapital : null}
      />
    </div>
  )
}

function RangeBar({
  range,
  setRange,
}: {
  range: RangePreset
  setRange: (v: RangePreset) => void
}) {
  return (
    <HudPanel className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-cyan-300" />
        <span className="hud-label">Portfolio</span>
      </div>
      <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
        <SelectTrigger className="w-[140px] border-cyan-400/20 bg-transparent">
          <SelectValue placeholder="Range" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="30d">Last 30 days</SelectItem>
          <SelectItem value="90d">Last 90 days</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>
    </HudPanel>
  )
}

function ExposureCard({ exposure }: { exposure: ExposureSummary }) {
  const pctTime =
    exposure.pctTimeInTrade == null ? "—" : `${(exposure.pctTimeInTrade * 100).toFixed(0)}%`
  const riskLabel =
    exposure.maxCapitalAtRiskPct == null
      ? "—"
      : `${exposure.maxCapitalAtRiskPct.toFixed(1)}%`
  return (
    <HudPanel glow="red">
      <HudPanelHeader
        title="Concurrent exposure"
        description={
          exposure.maxCapitalAtRiskPct != null
            ? `Never risk more than ${riskLabel} of capital at once`
            : "Add stops + balances to see capital-at-risk"
        }
      />
      <div className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
        <ExposureStat label="Max concurrent" value={String(exposure.maxConcurrent)} />
        <ExposureStat label="p95 concurrent" value={String(exposure.p95Concurrent)} />
        <ExposureStat label="Same direction" value={String(exposure.maxConcurrentSameDirection)} />
        <ExposureStat label="Time in trade" value={pctTime} />
        <ExposureStat label="Max risk at once" value={riskLabel} />
        <ExposureStat label="Longest hold" value={formatHoldDuration(exposure.longestSingleHoldMs)} />
      </div>
      {exposure.ignored > 0 ? (
        <p className="px-5 pb-4 text-xs text-muted-foreground">
          {exposure.ignored} open/unsettled trade{exposure.ignored === 1 ? "" : "s"} excluded from the
          sweep; {exposure.closedWithExit} measured.
        </p>
      ) : null}
    </HudPanel>
  )
}

function ExposureStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="hud-label">{label}</p>
      <p className="mt-1 text-xl font-semibold text-cyan-100">{value}</p>
    </div>
  )
}
