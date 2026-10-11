"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { useRouter, useSearchParams } from "next/navigation"
import { format, parseISO, subDays } from "date-fns"
import Link from "next/link"
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  Clock,
  Download,
  HelpCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react"
import { AnalyticsDashboardSkeleton } from "@/components/analytics/analytics-dashboard-skeleton"
import { AvoidInsights } from "@/components/analytics/avoid-insights"
import { EquityChart } from "@/components/analytics/equity-chart"
import { MaxDrawdownInsight } from "@/components/analytics/max-drawdown-insight"
import { PerformanceSummary } from "@/components/analytics/performance-summary"
import { PnlDistributionChart } from "@/components/analytics/pnl-distribution-chart"
import { StreaksRecords } from "@/components/analytics/streaks-records"
import { TopTradesHighlight } from "@/components/analytics/top-trades-highlight"
import { TimeAnalysisCharts } from "@/components/analytics/time-analysis-charts"
import { MonthlyProfitLoss } from "@/components/analytics/monthly-profit-loss"
import { PlanAdherence } from "@/components/analytics/plan-adherence"
import { RollingEdgeChart } from "@/components/analytics/rolling-edge-chart"
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
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import {
  formatHoldDuration,
  formatProfitFactor,
  formatR,
  type AnalyticsResult,
  type AttributionSummary,
  type PeriodComparison,
  type RMultipleSummary,
} from "@/lib/trading/analytics"
import { downloadAnalyticsCsv } from "@/lib/trading/export-analytics-csv"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type SourceFilter = "all" | "tradingview" | "manual"
type RangePreset = "7d" | "30d" | "90d" | "all" | "custom"
type DashboardTab = "overview" | "time-edge" | "breakdown" | "weekly" | "monthly"
type CustomRange = { from: Date; to: Date }

const KPI_TOOLTIPS: Record<string, string> = {
  "Net P&L": "Total profit or loss from all closed trades in this filter.",
  "Win Rate": "Percentage of closed trades that ended profitable.",
  "Profit Factor": "Gross profit divided by gross loss. Above 1.0 means overall profitable.",
  "Max Drawdown":
    "Largest peak-to-trough drop in cumulative equity. See the breakdown below for the trades that caused it.",
  "Avg Win": "Average profit on winning trades.",
  "Avg Loss": "Average loss on losing trades (absolute value).",
  Commission: "Total fees paid across closed trades.",
  "Recovery Factor":
    "Net profit divided by maximum drawdown — how many times over you recovered your worst drop. Above 1 means the edge outweighs the pain.",
  Sharpe:
    "Annualised return per unit of total volatility of daily P&L. Above 1 is respectable; below 0 means you lost more than you gained on a risk-adjusted basis.",
  Sortino:
    "Like Sharpe but only penalises downside days, so consistent small losses do not mask a strong upside.",
  Calmar:
    "Return divided by maximum drawdown over the sample. Sensitive to a single deep episode, so read it alongside the drawdown breakdown.",
  Kelly:
    "Fractional Kelly stake that maximises geometric growth given your win rate and payoff. The full number is aggressive; most traders size near half-Kelly.",
  "Avg Return": "Average return percentage per trade when return data exists.",
  "Avg Trades / Day": "Average number of closed trades on days you traded.",
  "Avg Profit / Day": "Average net P&L on days you had at least one closed trade.",
  "Avg Hold Time":
    "Average time between entry and exit. The card also shows the shortest and longest holds and the average on winning vs losing trades.",
  "Expectancy R":
    "Average profit per trade measured in risk units (R). Above 0 means the edge survives after sizing differences.",
  "Avg Win R": "Winners expressed in R — 1R is the amount you planned to risk.",
  "Avg Loss R": "Losers expressed in R. Should stay near -1R if you honour your stops.",
  "R:R": "Average win in R divided by average loss in R. Above 1 means winners outrun losers.",
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as AnalyticsResult
}

function rangeToDates(preset: RangePreset): { startDate?: string; endDate?: string } {
  if (preset === "all") return {}
  if (preset === "custom") return {}
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return {
    startDate: format(subDays(new Date(), days), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  }
}

function customRangeToDates(custom: CustomRange | null): { startDate?: string; endDate?: string } {
  if (!custom) return {}
  return {
    startDate: format(custom.from, "yyyy-MM-dd"),
    endDate: format(custom.to, "yyyy-MM-dd"),
  }
}

function parseDateParam(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = parseISO(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function AnalyticsDashboard() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Initial filters come from the URL so a shared link reproduces the exact view.
  const initial = useMemo(() => {
    const startDate = parseDateParam(searchParams.get("startDate"))
    const endDate = parseDateParam(searchParams.get("endDate"))
    let range = (searchParams.get("range") as RangePreset | null) ?? "all"
    let custom: CustomRange | null = null
    if (range === "custom") {
      if (startDate && endDate) custom = { from: startDate, to: endDate }
      else range = "all"
    }
    const rawStart = searchParams.get("startDate")
    const rawEnd = searchParams.get("endDate")
    // A bare startDate/endDate without a recognized preset still means a custom window.
    if (range !== "custom" && (rawStart || rawEnd) && !["7d", "30d", "90d", "all"].includes(range)) {
      range = "custom"
      if (startDate && endDate) custom = { from: startDate, to: endDate }
    }
    return {
      source: ((searchParams.get("source") as SourceFilter | null) ?? "all") as SourceFilter,
      range,
      custom,
      strategy: searchParams.get("strategy") ?? "all",
      instrument: searchParams.get("instrument") ?? "all",
    }
    // Parse once on mount; the URL is the source of truth thereafter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [source, setSource] = useState<SourceFilter>(initial.source)
  const [range, setRange] = useState<RangePreset>(initial.range)
  const [customRange, setCustomRange] = useState<CustomRange | null>(initial.custom)
  const [strategy, setStrategy] = useState(initial.strategy)
  const [instrument, setInstrument] = useState(initial.instrument)
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview")

  // Keep the address bar in sync so filters are copy-pasteable/shareable.
  useEffect(() => {
    const params = new URLSearchParams()
    if (source !== "all") params.set("source", source)
    params.set("range", range)
    if (range === "custom" && customRange) {
      params.set("startDate", format(customRange.from, "yyyy-MM-dd"))
      params.set("endDate", format(customRange.to, "yyyy-MM-dd"))
    }
    if (strategy !== "all") params.set("strategy", strategy)
    if (instrument !== "all") params.set("instrument", instrument)
    const qs = params.toString()
    router.replace(qs ? `/analytics?${qs}` : "/analytics", { scroll: false })
  }, [source, range, customRange, strategy, instrument, router])

  const query = useMemo(() => {
    const params = new URLSearchParams({ source })
    if (strategy !== "all") params.set("strategy", strategy)
    if (instrument !== "all") params.set("instrument", instrument)
    const { startDate, endDate } =
      range === "custom" ? customRangeToDates(customRange) : rangeToDates(range)
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    return `/api/analytics?${params.toString()}`
  }, [source, range, customRange, strategy, instrument])

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
          customRange={customRange}
          setCustomRange={setCustomRange}
          strategy={strategy}
          setStrategy={setStrategy}
          instrument={instrument}
          setInstrument={setInstrument}
          strategies={strategies}
          instruments={instruments}
          timezone={data?.timezone}
          attribution={data?.overview.attribution}
          meta={data?.meta}
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
  const pf = formatProfitFactor(overview.profitFactor)
  const bestMonthBucket = overview.bestMonth
    ? data.byMonth.find((m) => m.label === overview.bestMonth?.month)
    : undefined
  const worstMonthBucket = overview.worstMonth
    ? data.byMonth.find((m) => m.label === overview.worstMonth?.month)
    : undefined

  return (
    <div className="space-y-6">
      <FilterBar
        source={source}
        setSource={setSource}
        range={range}
        setRange={setRange}
        customRange={customRange}
        setCustomRange={setCustomRange}
        strategy={strategy}
        setStrategy={setStrategy}
        instrument={instrument}
        setInstrument={setInstrument}
        strategies={strategies}
        instruments={instruments}
        timezone={data.timezone}
        attribution={overview.attribution}
        meta={data.meta}
        onExport={() => downloadAnalyticsCsv(data)}
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
          <TabsTrigger value="monthly" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
            Monthly
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

          <RCards r={overview.r} closedTrades={overview.closedTrades} />

          {(overview.bestMonth || overview.worstMonth || data.byMonth.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {overview.bestMonth ? (
                <Badge variant="outline" className="border-emerald-400/30 text-emerald-400">
                  Best month: {overview.bestMonth.month} · {currency.format(overview.bestMonth.pnl)}
                  {bestMonthBucket?.returnPct != null
                    ? ` · ${bestMonthBucket.returnPct >= 0 ? "+" : ""}${bestMonthBucket.returnPct.toFixed(2)}%`
                    : ""}
                </Badge>
              ) : null}
              {overview.worstMonth ? (
                <Badge variant="outline" className="border-rose-400/30 text-rose-400">
                  Worst month: {overview.worstMonth.month} · {currency.format(overview.worstMonth.pnl)}
                  {worstMonthBucket?.returnPct != null
                    ? ` · ${worstMonthBucket.returnPct >= 0 ? "+" : ""}${worstMonthBucket.returnPct.toFixed(2)}%`
                    : ""}
                </Badge>
              ) : null}
            </div>
          )}

          <MoreMetricsAccordion overview={overview} />

          <EquityChart
            equityCurve={data.equityCurve}
            maxDrawdown={overview.maxDrawdown}
            maxDrawdownPct={overview.maxDrawdownPct}
            initialCapital={overview.initialCapital}
          />

          <MaxDrawdownInsight
            episode={data.maxDrawdownEpisode}
            maxDrawdown={overview.maxDrawdown}
            maxDrawdownPct={overview.maxDrawdownPct}
          />

          <RollingEdgeChart
            series={data.rollingEdge}
            overallExpectancyR={overview.r?.expectancyR ?? null}
          />

          <DistributionSwitch
            pnlDistribution={data.pnlDistribution}
            rDistribution={data.rDistribution}
            hasR={Boolean(overview.r)}
          />

          <PlanAdherence riskPlan={overview.riskPlan} />

          <TopTradesHighlight
            topWinners={data.topWinners}
            topLosers={data.topLosers}
            extremes={data.extremes}
            timezone={data.timezone}
            grossProfit={overview.grossProfit}
            grossLoss={overview.grossLoss}
          />

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
            concentration={overview.concentration}
          />
        </TabsContent>

        <TabsContent value="weekly" className="mt-6">
          <WeeklyProfitLoss byWeek={data.byWeek} />
        </TabsContent>

        <TabsContent value="monthly" className="mt-6">
          <MonthlyProfitLoss byMonth={data.byMonth} />
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
  customRange,
  setCustomRange,
  strategy,
  setStrategy,
  instrument,
  setInstrument,
  strategies,
  instruments,
  timezone,
  attribution,
  meta,
  onExport,
}: {
  source: SourceFilter
  setSource: (v: SourceFilter) => void
  range: RangePreset
  setRange: (v: RangePreset) => void
  customRange: CustomRange | null
  setCustomRange: (v: CustomRange | null) => void
  strategy: string
  setStrategy: (v: string) => void
  instrument: string
  setInstrument: (v: string) => void
  strategies: string[]
  instruments: string[]
  timezone?: string
  attribution?: AttributionSummary
  meta?: { truncated: boolean; fetched: number; limit: number }
  onExport?: () => void
}) {
  const longHoldsMayBeMissing =
    attribution != null &&
    attribution.lookbackDays > 0 &&
    attribution.maxHoldTimeMs !== null &&
    attribution.maxHoldTimeMs > 0.8 * attribution.lookbackDays * 86_400_000
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
            <SelectItem value="custom">Custom range</SelectItem>
          </SelectContent>
        </Select>

        {range === "custom" ? (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-[210px] justify-start border-cyan-400/20 bg-transparent text-xs font-normal text-cyan-200"
              >
                <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                {customRange
                  ? `${format(customRange.from, "MMM d")} – ${format(customRange.to, "MMM d, yyyy")}`
                  : "Pick dates"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                numberOfMonths={2}
                selected={customRange ?? undefined}
                onSelect={(selection) => {
                  if (selection?.from && selection?.to) {
                    setCustomRange({ from: selection.from, to: selection.to })
                  }
                }}
                captionLayout="dropdown"
              />
            </PopoverContent>
          </Popover>
        ) : null}

        {onExport ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onExport}
            className="h-9 border-cyan-400/20 bg-transparent text-cyan-200 hover:text-cyan-100"
          >
            <Download className="mr-1.5 h-4 w-4" />
            CSV
          </Button>
        ) : null}

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
            {attribution?.mode === "exit" ? " · buckets by exit date" : ""}
          </Badge>
        ) : null}

        {attribution?.dropped ? (
          <Badge variant="outline" className="border-cyan-400/20 text-xs text-cyan-300/80">
            {attribution.dropped} settled outside window
          </Badge>
        ) : null}

        {meta?.truncated ? (
          <Badge variant="outline" className="border-amber-400/30 text-xs text-amber-300">
            <AlertTriangle className="mr-1 h-3 w-3" />
            First {meta.fetched.toLocaleString()} trades only
          </Badge>
        ) : null}

        {longHoldsMayBeMissing ? (
          <Badge variant="outline" className="border-amber-400/30 text-xs text-amber-300">
            <AlertTriangle className="mr-1 h-3 w-3" />
            Very long holds may be missing
          </Badge>
        ) : null}
      </div>
      </div>
    </HudPanel>
  )
}

function RCards({ r, closedTrades }: { r: RMultipleSummary | null; closedTrades: number }) {
  if (!r) return null
  const weakBasis = r.method !== "stop_loss" || r.coverage < 0.5

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Expectancy R"
          value={formatR(r.expectancyR)}
          subtitle={`Over ${r.sampleSize} of ${closedTrades} closed trades`}
          positive={r.expectancyR > 0}
          negative={r.expectancyR < 0}
        />
        <KpiCard title="Avg Win R" value={formatR(r.avgWinR)} subtitle="Winner size in risk units" positive />
        <KpiCard title="Avg Loss R" value={formatR(r.avgLossR)} subtitle="Loser size in risk units" negative />
        <KpiCard
          title="R:R"
          value={r.avgRrRatio === null ? "—" : `${r.avgRrRatio.toFixed(2)}`}
          subtitle="Avg win R ÷ avg loss R"
        />
      </div>
      <Badge
        variant="outline"
        className={cn(
          "text-xs",
          weakBasis ? "border-amber-400/30 text-amber-300" : "border-cyan-400/20 text-cyan-300/80",
        )}
      >
        {weakBasis ? <AlertTriangle className="mr-1 h-3 w-3" /> : null}
        {weakBasis
          ? "R estimated from median loss — weak basis"
          : `R from stops · ${r.stopLossSampleSize}/${r.sampleSize}`}
      </Badge>
    </div>
  )
}

/**
 * Dollar buckets compare badly across a $5K and a $100K account, so the same
 * histogram is offered in R — scale-free — when the sample has a usable basis.
 */
function DistributionSwitch({
  pnlDistribution,
  rDistribution,
  hasR,
}: {
  pnlDistribution: AnalyticsResult["pnlDistribution"]
  rDistribution: AnalyticsResult["rDistribution"]
  hasR: boolean
}) {
  const [basis, setBasis] = useState<"usd" | "r">("usd")

  return (
    <div className="space-y-2">
      {hasR ? (
        <Tabs value={basis} onValueChange={(value) => setBasis(value as "usd" | "r")}>
          <TabsList className="h-auto border border-cyan-400/20 bg-[#0b1016] p-1">
            <TabsTrigger value="usd" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
              Dollar buckets
            </TabsTrigger>
            <TabsTrigger value="r" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
              R buckets
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {basis === "r" && hasR ? (
        <PnlDistributionChart
          distribution={rDistribution}
          title="R distribution"
          description="Trades grouped by risk multiple — comparable across accounts and strategies"
        />
      ) : (
        <PnlDistributionChart distribution={pnlDistribution} />
      )}
    </div>
  )
}

function ComparisonLine({ comparison }: { comparison: PeriodComparison }) {
  const parts: { label: string; text: string; tone: "up" | "down" | "flat" }[] = []
  const sign = (n: number) => (n >= 0 ? "+" : "")
  // Drawdown deltas read inverted: a smaller drawdown is an improvement.
  const tone = (n: number, invert = false): "up" | "down" | "flat" => {
    const v = invert ? -n : n
    return v > 0 ? "up" : v < 0 ? "down" : "flat"
  }

  parts.push({
    label: "P&L",
    text: `${sign(comparison.netPnlDelta)}${currency.format(comparison.netPnlDelta)}`,
    tone: tone(comparison.netPnlDelta),
  })
  parts.push({
    label: "Win rate",
    text: `${sign(comparison.winRateDelta)}${comparison.winRateDelta.toFixed(1)}%`,
    tone: tone(comparison.winRateDelta),
  })
  parts.push({
    label: "",
    text: `${sign(comparison.closedTradesDelta)}${comparison.closedTradesDelta} trades`,
    tone: tone(comparison.closedTradesDelta),
  })
  if (comparison.profitFactorDelta !== null) {
    parts.push({
      label: "PF",
      text: `${sign(comparison.profitFactorDelta)}${comparison.profitFactorDelta.toFixed(2)}`,
      tone: tone(comparison.profitFactorDelta),
    })
  }
  parts.push({
    label: "Expect",
    text: `${sign(comparison.expectancyDelta)}${currency.format(comparison.expectancyDelta)}`,
    tone: tone(comparison.expectancyDelta),
  })
  if (comparison.avgRDelta !== null) {
    parts.push({
      label: "Exp R",
      text: `${sign(comparison.avgRDelta)}${comparison.avgRDelta.toFixed(2)}R`,
      tone: tone(comparison.avgRDelta),
    })
  }
  parts.push({
    label: "Max DD",
    text: `${sign(comparison.maxDrawdownPctDelta)}${comparison.maxDrawdownPctDelta.toFixed(1)}pp`,
    tone: tone(comparison.maxDrawdownPctDelta, true),
  })

  const toneClass = { up: "text-emerald-400", down: "text-rose-400", flat: "text-muted-foreground" }

  return (
    <p className="text-xs text-muted-foreground">
      <span>vs {comparison.label}: </span>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {p.label ? `${p.label} ` : ""}
          <span className={toneClass[p.tone]}>{p.text}</span>
        </span>
      ))}
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
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          title="Net P&L"
          value={currency.format(overview.netPnl)}
          subtitle={`${overview.closedTrades} closed trades`}
          positive={overview.netPnl >= 0}
          icon={overview.netPnl >= 0 ? TrendingUp : TrendingDown}
        />
        <KpiCard
          title="Return"
          value={
            overview.returnPct === null
              ? "—"
              : `${overview.returnPct >= 0 ? "+" : ""}${overview.returnPct.toFixed(2)}%`
          }
          subtitle={
            overview.returnPct === null
              ? "Set initial capital on the account"
              : `On ${currency.format(overview.initialCapital ?? 0)} starting capital`
          }
          positive={overview.returnPct !== null && overview.returnPct >= 0}
          negative={overview.returnPct !== null && overview.returnPct < 0}
          icon={overview.returnPct !== null && overview.returnPct >= 0 ? TrendingUp : TrendingDown}
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
          subtitle={
            overview.underwaterDayPct !== null
              ? `${overview.maxDrawdownPct.toFixed(1)}% from peak · ${overview.underwaterDayPct.toFixed(0)}% of days underwater`
              : `${overview.maxDrawdownPct.toFixed(1)}% from peak`
          }
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
            <KpiCard
              title="Commission"
              value={currency.format(overview.totalCommission)}
              subtitle={commissionSubtitle(overview.fees)}
              badge={commissionBadge(overview.fees)}
            />
            <KpiCard
              title="Recovery Factor"
              value={overview.recoveryFactor === null ? "—" : overview.recoveryFactor.toFixed(2)}
              subtitle={
                overview.drawdownRecoveryDays !== null
                  ? `Recovered in ${overview.drawdownRecoveryDays}d`
                  : overview.maxDrawdownDurationDays !== null
                    ? `${overview.maxDrawdownDurationDays}d peak→trough, still underwater`
                    : "Net P&L ÷ max drawdown"
              }
              positive={overview.recoveryFactor !== null && overview.recoveryFactor >= 1}
              negative={overview.recoveryFactor !== null && overview.recoveryFactor < 0}
            />
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
              title="Avg Profit / Day"
              value={currency.format(overview.avgProfitPerDay)}
              subtitle={
                overview.tradingDays > 0
                  ? `${overview.tradingDays} active trading days`
                  : "No trading days yet"
              }
              positive={overview.avgProfitPerDay >= 0}
              negative={overview.avgProfitPerDay < 0}
              icon={overview.avgProfitPerDay >= 0 ? TrendingUp : TrendingDown}
            />
            <KpiCard
              title="Day structure"
              value={
                overview.dayStructure
                  ? `${overview.dayStructure.profitableDayPct.toFixed(0)}% green`
                  : "—"
              }
              subtitle={
                overview.dayStructure
                  ? `${overview.dayStructure.profitableDays} green · ${overview.dayStructure.losingDays} red · worst run ${overview.dayStructure.longestRedDayRun}d`
                  : "No trading days yet"
              }
              positive={
                overview.dayStructure !== null && overview.dayStructure.profitableDayPct >= 50
              }
              negative={
                overview.dayStructure !== null && overview.dayStructure.profitableDayPct < 50
              }
            />
            <KpiCard
              title="Avg Hold Time"
              value={formatHoldDuration(overview.avgHoldTimeMs)}
              subtitle={
                overview.holdTimeTrades > 0
                  ? `Min ${formatHoldDuration(overview.minHoldTimeMs)} · Max ${formatHoldDuration(overview.maxHoldTimeMs)} · Wins ${formatHoldDuration(overview.avgHoldTimeWinMs)} · Losses ${formatHoldDuration(overview.avgHoldTimeLossMs)}`
                  : "Re-import from extension to backfill exit times"
              }
              icon={Clock}
            />
            <RiskRatioCards overview={overview} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function RiskRatioCards({ overview }: { overview: AnalyticsResult["overview"] }) {
  const ratios = overview.riskRatios
  const sig = overview.significance
  const num = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(value) ? "—" : value.toFixed(2)
  return (
    <>
      <KpiCard
        title="Sharpe"
        value={ratios ? num(ratios.sharpe) : "—"}
        subtitle={
          ratios
            ? `${ratios.basis === "capital_pct" ? "return on capital" : "dollar"} · ${ratios.sampleDays}d`
            : "Need 20+ trading days"
        }
        positive={ratios !== null && ratios.sharpe !== null && ratios.sharpe >= 1}
        negative={ratios !== null && ratios.sharpe !== null && ratios.sharpe < 0}
      />
      <KpiCard
        title="Sortino"
        value={ratios ? num(ratios.sortino) : "—"}
        subtitle={ratios ? "downside-only risk" : "Need 20+ trading days"}
        positive={ratios !== null && ratios.sortino !== null && ratios.sortino >= 1}
        negative={ratios !== null && ratios.sortino !== null && ratios.sortino < 0}
      />
      <KpiCard
        title="Calmar"
        value={ratios ? num(ratios.calmar) : "—"}
        subtitle={ratios ? "return ÷ max drawdown" : "Need 20+ trading days"}
        positive={ratios !== null && ratios.calmar !== null && ratios.calmar >= 1}
        negative={ratios !== null && ratios.calmar !== null && ratios.calmar < 0}
      />
      <KpiCard
        title="Kelly"
        value={sig && sig.kelly !== null ? `${(sig.kelly * 100).toFixed(1)}%` : "—"}
        subtitle={
          sig && sig.halfKelly !== null
            ? `half-Kelly ${(sig.halfKelly * 100).toFixed(1)}%${sig.significant ? " · significant" : " · not significant"}`
            : "sample too small"
        }
        positive={sig !== null && sig.kelly !== null && sig.kelly > 0 && sig.significant}
      />
    </>
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

type CommissionSummary = NonNullable<AnalyticsResult["overview"]["fees"]>

function commissionSubtitle(fees: CommissionSummary | null): string {
  if (!fees) return "Total fees"
  const drag = fees.feeDragPct != null ? `${(fees.feeDragPct * 100).toFixed(1)}% of gross profit` : "on non-positive gross"
  const coverage = ` · ${Math.round(fees.coverage * 100)}% of trades carry fees`
  return `${drag}${coverage}`
}

/** Flag when commission eats more than a fifth of gross profit. */
function commissionBadge(fees: CommissionSummary | null): string | undefined {
  if (!fees) return undefined
  if (fees.feeDragPct != null && fees.feeDragPct > 0.2) return "High fee drag"
  if (fees.feeShareOfEdge != null && fees.feeShareOfEdge > 0.5) return "Fees exceed half the edge"
  return undefined
}

export function KpiCard({
  title,
  value,
  subtitle,
  positive,
  negative,
  icon: Icon,
  badge,
}: {
  title: string
  value: string
  subtitle?: string
  positive?: boolean
  negative?: boolean
  icon?: React.ComponentType<{ className?: string }>
  badge?: string
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
          {badge ? (
            <Badge variant="outline" className="mt-2 border-amber-400/40 bg-amber-400/10 text-amber-300">
              {badge}
            </Badge>
          ) : null}
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
  concentration,
}: {
  byStrategy: AnalyticsResult["byStrategy"]
  bySignal: AnalyticsResult["bySignal"]
  byInstrument: AnalyticsResult["byInstrument"]
  concentration: AnalyticsResult["overview"]["concentration"]
}) {
  const hasSignalData = bySignal.some((row) => row.key !== "—" && row.trades > 0)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-200/80">Strategy deep dive</h2>
      {concentration ? <ConcentrationCard concentration={concentration} /> : null}
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

function ConcentrationCard({
  concentration,
}: {
  concentration: NonNullable<AnalyticsResult["overview"]["concentration"]>
}) {
  const pct = (value: number | null) => (value === null ? "—" : `${(value * 100).toFixed(0)}%`)
  const winDominant = concentration.top5WinShare !== null && concentration.top5WinShare > 0.5
  const lossDominant = concentration.top5LossShare !== null && concentration.top5LossShare > 0.5
  return (
    <HudPanel glow={winDominant || lossDominant ? "red" : "cyan"} className="p-4">
      <p className="text-sm font-semibold">P&amp;L concentration</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        How much of the total rides on a handful of trades — high shares mean fragile results
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="hud-label">Top 5 winners</p>
          <p className={cn("mt-1 text-lg font-semibold", winDominant ? "text-rose-400" : "text-emerald-400")}>
            {pct(concentration.top5WinShare)}
          </p>
          <p className="text-xs text-muted-foreground">of gross profit</p>
        </div>
        <div>
          <p className="hud-label">Top 5 losers</p>
          <p className={cn("mt-1 text-lg font-semibold", lossDominant ? "text-rose-400" : "text-cyan-100")}>
            {pct(concentration.top5LossShare)}
          </p>
          <p className="text-xs text-muted-foreground">of gross loss</p>
        </div>
        <div>
          <p className="hud-label">Biggest single trade</p>
          <p className="mt-1 text-lg font-semibold text-cyan-100">{pct(concentration.largestTradeShare)}</p>
          <p className="text-xs text-muted-foreground">of total P&amp;L</p>
        </div>
      </div>
    </HudPanel>
  )
}

/** Buckets below this trade count get a low-sample flag — their rates are noise. */
const LOW_N_THRESHOLD = 10

export function BucketTable({ rows }: { rows: AnalyticsResult["byStrategy"] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="border-cyan-400/10 hover:bg-transparent">
          <TableHead className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Name</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Trades</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">W / L</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Win %</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Avg P&amp;L</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net P&amp;L</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Avg R</TableHead>
          <TableHead className="text-right text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Fee drag</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.key} className="border-cyan-400/10 hover:bg-cyan-400/5">
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2">
                {row.label}
                {row.trades < LOW_N_THRESHOLD ? (
                  <Badge variant="outline" className="border-amber-400/30 text-[10px] text-amber-300">
                    low n
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-right">{row.trades}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              <span className="text-emerald-400">{row.wins}</span>
              {" / "}
              <span className="text-rose-400">{row.losses}</span>
            </TableCell>
            <TableCell className="text-right">{row.winRate.toFixed(1)}%</TableCell>
            <TableCell
              className={`text-right ${row.avgPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {currency.format(row.avgPnl)}
            </TableCell>
            <TableCell
              className={`text-right ${row.netPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
            >
              {currency.format(row.netPnl)}
            </TableCell>
            <TableCell
              className={`text-right ${
                row.avgR == null
                  ? "text-muted-foreground"
                  : row.avgR >= 0
                    ? "text-emerald-400"
                    : "text-rose-400"
              }`}
            >
              {formatR(row.avgR)}
            </TableCell>
            <TableCell
              className={`text-right ${
                row.feeDragPct != null && row.feeDragPct > 0.2 ? "text-amber-400" : "text-muted-foreground"
              }`}
            >
              {row.feeDragPct == null ? "—" : `${(row.feeDragPct * 100).toFixed(1)}%`}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
