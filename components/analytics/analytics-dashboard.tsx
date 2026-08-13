"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { format, subDays } from "date-fns"
import Link from "next/link"
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Clock,
  HelpCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { AnalyticsDashboardSkeleton } from "@/components/analytics/analytics-dashboard-skeleton"
import { AvoidInsights } from "@/components/analytics/avoid-insights"
import { EquityChart } from "@/components/analytics/equity-chart"
import { PerformanceSummary } from "@/components/analytics/performance-summary"
import { PnlDistributionChart } from "@/components/analytics/pnl-distribution-chart"
import { StreaksRecords } from "@/components/analytics/streaks-records"
import { TimeAnalysisCharts } from "@/components/analytics/time-analysis-charts"
import { WeeklyProfitLoss } from "@/components/analytics/weekly-profit-loss"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { WinRateRing } from "@/components/dashboard/sparkline"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import { formatHoldDuration, type AnalyticsResult, type PeriodComparison } from "@/lib/trading/analytics"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type SourceFilter = "all" | "tradingview" | "manual"
type RangePreset = "7d" | "30d" | "90d" | "all"
type DashboardTab = "overview" | "time-edge" | "breakdown" | "weekly"

const KPI_TOOLTIPS: Record<string, string> = {
  "Net P&L": "Total profit or loss from all closed trades in this filter.",
  "Win Rate": "Percentage of closed trades that ended profitable.",
  "Profit Factor": "Gross profit divided by gross loss. Above 1.0 means overall profitable.",
  "Max Drawdown": "Largest peak-to-trough drop in cumulative equity.",
  "Avg Win": "Average profit on winning trades.",
  "Avg Loss": "Average loss on losing trades (absolute value).",
  Commission: "Total fees paid across closed trades.",
  "Avg Return": "Average return percentage per trade when return data exists.",
  "Avg Trades / Day": "Average number of closed trades on days you traded.",
  "Avg Hold Time": "Average time between entry and exit.",
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as AnalyticsResult
}

function rangeToDates(preset: RangePreset): { startDate?: string; endDate?: string } {
  if (preset === "all") return {}
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return {
    startDate: format(subDays(new Date(), days), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  }
}

export function AnalyticsDashboard() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const [source, setSource] = useState<SourceFilter>("all")
  const [range, setRange] = useState<RangePreset>("all")
  const [strategy, setStrategy] = useState("all")
  const [instrument, setInstrument] = useState("all")
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview")

  const query = useMemo(() => {
    const params = new URLSearchParams({ source })
    if (strategy !== "all") params.set("strategy", strategy)
    if (instrument !== "all") params.set("instrument", instrument)
    const { startDate, endDate } = rangeToDates(range)
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    return `/api/analytics?${params.toString()}`
  }, [source, range, strategy, instrument])

  const { data, error, isLoading, isValidating } = useSWR<AnalyticsResult>(
    activeAccountId ? [query, activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
    { keepPreviousData: true },
  )

  const strategies = data?.strategies ?? []
  const instruments = data?.instruments ?? []

  if (isLoading && !data) {
    return <AnalyticsDashboardSkeleton />
  }

  if (error && !data) {
    return (
      <HudPanel className="p-8 text-center text-rose-400">
        Failed to load analytics. Please try again.
      </HudPanel>
    )
  }

  if (!data?.overview || data.overview.closedTrades === 0) {
    return (
      <div className="space-y-6">
        <FilterBar
          source={source}
          setSource={setSource}
          range={range}
          setRange={setRange}
          strategy={strategy}
          setStrategy={setStrategy}
          instrument={instrument}
          setInstrument={setInstrument}
          strategies={strategies}
          instruments={instruments}
          timezone={data?.timezone}
        />
        <HudPanel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <BarChart3 className="h-12 w-12 text-cyan-400/50" />
          <div>
            <p className="font-medium">No closed trades for this filter</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Import trades from Live Sync to see backtest analytics, or add manual journal entries.
            </p>
          </div>
          <Button asChild variant="outline" className="border-cyan-400/30 text-cyan-200">
            <Link href="/live-sync">Go to Live Sync</Link>
          </Button>
        </HudPanel>
      </div>
    )
  }

  const overview = data.overview
  const pf =
    overview.profitFactor === Infinity ? "∞" : overview.profitFactor.toFixed(2)

  return (
    <div className="space-y-6">
      <FilterBar
        source={source}
        setSource={setSource}
        range={range}
        setRange={setRange}
        strategy={strategy}
        setStrategy={setStrategy}
        instrument={instrument}
        setInstrument={setInstrument}
        strategies={strategies}
        instruments={instruments}
        timezone={data.timezone}
      />

      {isValidating ? (
        <p className="text-xs text-cyan-300/70">Updating analytics…</p>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as DashboardTab)}>
        <TabsList className="h-auto flex-wrap border border-cyan-400/20 bg-[#0b1016] p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Overview
          </TabsTrigger>
          <TabsTrigger value="time-edge" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Time Edge
          </TabsTrigger>
          <TabsTrigger value="breakdown" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Breakdown
          </TabsTrigger>
          <TabsTrigger value="weekly" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Weekly
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-6">
          <PerformanceSummary
            overview={overview}
            records={data.records}
            bestSession={data.avoid.bestSessions[0] ?? null}
            weakestDay={data.avoid.days[0] ?? null}
          />

          <HeroKpiRow overview={overview} pf={pf} comparison={data.comparison} />

          {(overview.bestMonth || overview.worstMonth) && (
            <div className="flex flex-wrap gap-2">
              {overview.bestMonth ? (
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-400">
                  Best month: {overview.bestMonth.month} · {currency.format(overview.bestMonth.pnl)}
                </Badge>
              ) : null}
              {overview.worstMonth ? (
                <Badge variant="outline" className="border-rose-400/30 text-rose-400">
                  Worst month: {overview.worstMonth.month} · {currency.format(overview.worstMonth.pnl)}
                </Badge>
              ) : null}
            </div>
          )}

          <MoreMetricsAccordion overview={overview} />

          <EquityChart
            equityCurve={data.equityCurve}
            maxDrawdown={overview.maxDrawdown}
            maxDrawdownPct={overview.maxDrawdownPct}
          />

          <PnlDistributionChart distribution={data.pnlDistribution} />

          <StreaksRecords records={data.records} />
        </TabsContent>

        <TabsContent value="time-edge" className="mt-6 space-y-6">
          <AvoidInsights
            avoidHours={data.avoid.hours}
            avoidDays={data.avoid.days}
            avoidSessions={data.avoid.sessions}
            bestHours={data.avoid.bestHours}
            bestDays={data.avoid.bestDays}
            bestSessions={data.avoid.bestSessions}
          />
          <TimeAnalysisCharts
            byHour={data.byHour}
            byWeekday={data.byWeekday}
            byMonth={data.byMonth}
            bySession={data.bySession}
            hideMonthly
          />
        </TabsContent>

        <TabsContent value="breakdown" className="mt-6 space-y-6">
          <LongShortCard overview={overview} />
          <StrategyDeepDive
            byStrategy={data.byStrategy}
            bySignal={data.bySignal}
            byInstrument={data.byInstrument}
          />
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <WeeklyProfitLoss byWeek={data.byWeek} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function FilterBar({
  source,
  setSource,
  range,
  setRange,
  strategy,
  setStrategy,
  instrument,
  setInstrument,
  strategies,
  instruments,
  timezone,
}: {
  source: SourceFilter
  setSource: (v: SourceFilter) => void
  range: RangePreset
  setRange: (v: RangePreset) => void
  strategy: string
  setStrategy: (v: string) => void
  instrument: string
  setInstrument: (v: string) => void
  strategies: string[]
  instruments: string[]
  timezone?: string
}) {
  return (
    <HudPanel className="px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <Tabs value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
        <TabsList className="border border-cyan-400/20 bg-[#05070a]">
          <TabsTrigger value="all" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            All
          </TabsTrigger>
          <TabsTrigger value="tradingview" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            TradingView
          </TabsTrigger>
          <TabsTrigger value="manual" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Manual
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
          <SelectTrigger className="w-[130px] border-cyan-400/20 bg-transparent">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        {strategies.length > 0 && (
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="w-[180px] border-cyan-400/20 bg-transparent">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              {strategies.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {instruments.length > 0 && (
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger className="w-[160px] border-cyan-400/20 bg-transparent">
              <SelectValue placeholder="Instrument" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All instruments</SelectItem>
              {instruments.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {timezone ? (
          <Badge variant="outline" className="border-cyan-400/20 text-xs text-cyan-300/80">
            Times in {timezone.replace(/_/g, " ")}
          </Badge>
        ) : null}
      </div>
      </div>
    </HudPanel>
  )
}

function ComparisonLine({ comparison }: { comparison: PeriodComparison }) {
  const pnlSign = comparison.netPnlDelta >= 0 ? "+" : ""
  const wrSign = comparison.winRateDelta >= 0 ? "+" : ""
  return (
    <p className="text-xs text-muted-foreground">
      vs {comparison.label}: P&amp;L {pnlSign}
      {currency.format(comparison.netPnlDelta)} · Win rate {wrSign}
      {comparison.winRateDelta.toFixed(1)}% · {comparison.closedTradesDelta >= 0 ? "+" : ""}
      {comparison.closedTradesDelta} trades
    </p>
  )
}

function HeroKpiRow({
  overview,
  pf,
  comparison,
}: {
  overview: AnalyticsResult["overview"]
  pf: string
  comparison: PeriodComparison | null
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Net P&L"
          value={currency.format(overview.netPnl)}
          subtitle={`${overview.closedTrades} closed trades`}
          positive={overview.netPnl >= 0}
          icon={overview.netPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <HudPanel className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <KpiTitle title="Win Rate" />
              <p className="mt-2 text-2xl font-semibold text-cyan-300">{overview.winRate.toFixed(1)}%</p>
            </div>
            <WinRateRing value={overview.winRate} />
          </div>
        </HudPanel>
        <KpiCard
          title="Profit Factor"
          value={pf}
          subtitle={`Expectancy ${currency.format(overview.expectancy)}`}
        />
        <KpiCard
          title="Max Drawdown"
          value={currency.format(overview.maxDrawdown)}
          subtitle={`${overview.maxDrawdownPct.toFixed(1)}% from peak`}
          negative
          icon={AlertTriangle}
        />
      </div>
      {comparison ? <ComparisonLine comparison={comparison} /> : null}
    </div>
  )
}

function MoreMetricsAccordion({ overview }: { overview: AnalyticsResult["overview"] }) {
  return (
    <Accordion type="single" collapsible>
      <AccordionItem value="more-metrics" className="hud-panel border-cyan-400/20 px-4">
        <AccordionTrigger className="py-3 hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-medium">
            More metrics
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid grid-cols-1 gap-4 pb-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard title="Avg Win" value={currency.format(overview.avgWin)} subtitle={`${overview.wins} wins`} positive />
            <KpiCard title="Avg Loss" value={currency.format(overview.avgLoss)} subtitle={`${overview.losses} losses`} negative />
            <KpiCard title="Commission" value={currency.format(overview.totalCommission)} subtitle="Total fees" />
            <KpiCard
              title="Avg Return"
              value={`${overview.avgReturnPct >= 0 ? "+" : ""}${overview.avgReturnPct.toFixed(2)}%`}
              subtitle="Per trade (when available)"
            />
            <KpiCard
              title="Avg Trades / Day"
              value={overview.avgTradesPerDay.toFixed(1)}
              subtitle={
                overview.tradingDays > 0
                  ? `${overview.tradingDays} active days · min ${overview.minTradesPerDay} · max ${overview.maxTradesPerDay}`
                  : "No trading days yet"
              }
              icon={BarChart3}
            />
            <KpiCard
              title="Avg Hold Time"
              value={formatHoldDuration(overview.avgHoldTimeMs)}
              subtitle={
                overview.holdTimeTrades > 0
                  ? `${overview.holdTimeTrades} trades · Wins ${formatHoldDuration(overview.avgHoldTimeWinMs)} · Losses ${formatHoldDuration(overview.avgHoldTimeLossMs)}`
                  : "Re-import from extension to backfill exit times"
              }
              icon={Clock}
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function KpiTitle({ title }: { title: string }) {
  const tooltip = KPI_TOOLTIPS[title]
  return (
    <div className="flex items-center gap-1.5">
      <p className="hud-label">{title}</p>
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="text-muted-foreground hover:text-foreground">
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs text-xs">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
  positive,
  negative,
  icon: Icon,
}: {
  title: string
  value: string
  subtitle?: string
  positive?: boolean
  negative?: boolean
  icon?: React.ComponentType<{ className?: string }>
}) {
  return (
    <HudPanel glow={positive ? "green" : negative ? "red" : "cyan"} className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <KpiTitle title={title} />
          <p
            className={cn(
              "mt-2 text-2xl font-semibold tracking-tight",
              positive ? "text-emerald-400" : negative ? "text-rose-400" : "text-cyan-100",
            )}
          >
            {value}
          </p>
          {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {Icon ? (
          <div
            className={cn(
              "rounded-lg p-2",
              negative ? "bg-rose-500/10 text-rose-400" : positive ? "bg-emerald-500/10 text-emerald-400" : "bg-cyan-500/10 text-cyan-300",
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        ) : null}
      </div>
    </HudPanel>
  )
}

function LongShortCard({ overview }: { overview: AnalyticsResult["overview"] }) {
  return (
    <HudPanel>
      <HudPanelHeader title="Long vs Short" description="Directional performance for closed trades" />
      <div className="space-y-3 p-5 text-sm">
        <div className="flex justify-between">
          <span>Long ({overview.longTrades})</span>
          <span className={overview.longPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {currency.format(overview.longPnl)}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Short ({overview.shortTrades})</span>
          <span className={overview.shortPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
            {currency.format(overview.shortPnl)}
          </span>
        </div>
        {overview.openTrades > 0 ? (
          <p className="text-muted-foreground">{overview.openTrades} open trades excluded</p>
        ) : null}
      </div>
    </HudPanel>
  )
}

function StrategyDeepDive({
  byStrategy,
  bySignal,
  byInstrument,
}: {
  byStrategy: AnalyticsResult["byStrategy"]
  bySignal: AnalyticsResult["bySignal"]
  byInstrument: AnalyticsResult["byInstrument"]
}) {
  const hasSignalData = bySignal.some((row) => row.key !== "—" && row.trades > 0)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Strategy deep dive</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <HudPanel>
          <HudPanelHeader title="By strategy" />
          <div className="p-4">
            {byStrategy.length > 0 ? (
              <BucketTable rows={byStrategy} />
            ) : (
              <p className="text-sm text-muted-foreground">No strategy data for this filter.</p>
            )}
          </div>
        </HudPanel>

        <HudPanel>
          <HudPanelHeader title="By signal" description="Entry signals from backtest" />
          <div className="p-4">
            {hasSignalData ? (
              <BucketTable rows={bySignal} />
            ) : (
              <p className="text-sm text-muted-foreground">No signal data for this filter.</p>
            )}
          </div>
        </HudPanel>

        <HudPanel className="lg:col-span-2">
          <HudPanelHeader title="By instrument" />
          <div className="p-4">
            {byInstrument.length > 0 ? (
              <BucketTable rows={byInstrument.slice(0, 10)} />
            ) : (
              <p className="text-sm text-muted-foreground">No instrument data for this filter.</p>
            )}
          </div>
        </HudPanel>
      </div>
    </div>
  )
}

function BucketTable({ rows }: { rows: AnalyticsResult["byStrategy"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-cyan-400/10 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Name</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Win %</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net P&amp;L</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="border-cyan-400/10 hover:bg-cyan-400/5">
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right">{row.trades}</TableCell>
            <TableCell className="text-right">{row.winRate.toFixed(1)}%</TableCell>
            <TableCell
              className={`text-right ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {currency.format(row.netPnl)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
