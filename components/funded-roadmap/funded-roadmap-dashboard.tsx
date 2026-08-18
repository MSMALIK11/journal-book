"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { format, subDays } from "date-fns"
import Link from "next/link"
import { HelpCircle, Map, ShieldAlert } from "lucide-react"
import { FundedRoadmapCharts } from "@/components/funded-roadmap/funded-roadmap-charts"
import { FundedRoadmapSkeleton } from "@/components/funded-roadmap/funded-roadmap-skeleton"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useActiveAccount } from "@/hooks/use-active-account"
import { authFetch } from "@/lib/client-auth"
import type { EquityPoint } from "@/lib/trading/analytics"
import {
  DEFAULT_FUNDED_RULES,
  FUNDED_FIRM_PRESETS,
  RISK_PERCENT_PRESETS,
  type FundedChallengeRules,
  type RiskMode,
} from "@/lib/trading/funded-presets"
import {
  formatDays,
  formatRr,
  type CompareSnapshot,
  type DataSourceLabel,
  type DirectionFilter,
  type FundedRoadmapModel,
  type ScenarioKey,
  type SessionFilter,
  type StageStatus,
  type WeekdayFilter,
} from "@/lib/trading/funded-roadmap"
import { cn } from "@/lib/utils"

const SETTINGS_KEY = "jb-funded-roadmap-v1"
const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type SourceFilter = "all" | "tradingview" | "manual"
type RangePreset = "7d" | "30d" | "90d" | "all"

type RoadmapResponse = FundedRoadmapModel & {
  timezone: string
  strategies: string[]
  instruments: string[]
  source: string
  sourceLabel: DataSourceLabel
  filterLabel: string
  snapshot: CompareSnapshot
  equityCurve: EquityPoint[]
  rules: FundedChallengeRules
}

type PersistedSettings = {
  riskMode: RiskMode
  riskPercent: number
  customRisk: string
  fixedRisk: string
  preset: string
  rules: FundedChallengeRules
  scenario: ScenarioKey
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as RoadmapResponse
}

function rangeToDates(preset: RangePreset) {
  if (preset === "all") return {}
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return {
    startDate: format(subDays(new Date(), days), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  }
}

function readSettings(): PersistedSettings {
  const fallback: PersistedSettings = {
    riskMode: "percent",
    riskPercent: 1,
    customRisk: "",
    fixedRisk: "50",
    preset: "generic",
    rules: DEFAULT_FUNDED_RULES,
    scenario: "optimistic",
  }
  if (typeof window === "undefined") return fallback
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY)
    if (!raw) return fallback
    return { ...fallback, ...JSON.parse(raw) }
  } catch {
    return fallback
  }
}

function statusClass(status: StageStatus) {
  if (status === "At Risk") return "border-rose-400/40 text-rose-200"
  if (status === "Ready") return "border-emerald-400/40 text-emerald-200"
  if (status === "Current") return "border-cyan-400/40 text-cyan-200"
  if (status === "Completed") return "border-emerald-400/20 text-emerald-300/80"
  return "border-white/10 text-muted-foreground"
}

function Kpi({
  title,
  value,
  hint,
  tone,
}: {
  title: string
  value: string
  hint?: string
  tone?: "up" | "down" | "neutral"
}) {
  return (
    <HudPanel className="p-4">
      <p className="hud-label">{title}</p>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tracking-tight",
          tone === "up" && "text-emerald-400",
          tone === "down" && "text-rose-400",
          !tone && "text-cyan-100",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </HudPanel>
  )
}

export function FundedRoadmapDashboard() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const saved = useMemo(() => readSettings(), [])
  const [source, setSource] = useState<SourceFilter>("tradingview")
  const [range, setRange] = useState<RangePreset>("all")
  const [strategy, setStrategy] = useState("all")
  const [instrument, setInstrument] = useState("all")
  const [direction, setDirection] = useState<DirectionFilter>("all")
  const [session, setSession] = useState<SessionFilter>("all")
  const [weekday, setWeekday] = useState<WeekdayFilter>("all")
  const [riskMode, setRiskMode] = useState<RiskMode>(saved.riskMode)
  const [riskPercent, setRiskPercent] = useState(saved.riskPercent)
  const [customRisk, setCustomRisk] = useState(saved.customRisk)
  const [fixedRisk, setFixedRisk] = useState(saved.fixedRisk)
  const [preset, setPreset] = useState(saved.preset)
  const [rules, setRules] = useState<FundedChallengeRules>(saved.rules)
  const [scenario, setScenario] = useState<ScenarioKey>(saved.scenario)
  const [compareOn, setCompareOn] = useState(false)
  const [compareStrategy, setCompareStrategy] = useState("all")
  const [compareSession, setCompareSession] = useState<SessionFilter>("all")

  useEffect(() => {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ riskMode, riskPercent, customRisk, fixedRisk, preset, rules, scenario }),
    )
  }, [riskMode, riskPercent, customRisk, fixedRisk, preset, rules, scenario])

  const effectiveRisk = customRisk.trim() ? Number(customRisk) : riskPercent
  const query = useMemo(() => {
    const params = new URLSearchParams({
      source,
      direction,
      session,
      weekday,
      riskMode,
      riskPercent: String(Number.isFinite(effectiveRisk) && effectiveRisk > 0 ? effectiveRisk : 1),
      fixedRisk: String(Number(fixedRisk) > 0 ? fixedRisk : 50),
      preset,
      profitTargetPct: String(rules.profitTargetPct),
      maxDrawdownPct: String(rules.maxDrawdownPct),
      dailyDrawdownPct: String(rules.dailyDrawdownPct),
      minTradingDays: String(rules.minTradingDays),
      profitSplitPct: String(rules.profitSplitPct),
    })
    if (strategy !== "all") params.set("strategy", strategy)
    if (instrument !== "all") params.set("instrument", instrument)
    const dates = rangeToDates(range)
    if (dates.startDate) params.set("startDate", dates.startDate)
    if (dates.endDate) params.set("endDate", dates.endDate)
    return `/api/funded-roadmap?${params.toString()}`
  }, [
    source,
    direction,
    session,
    weekday,
    riskMode,
    effectiveRisk,
    fixedRisk,
    preset,
    rules,
    strategy,
    instrument,
    range,
  ])

  const compareQuery = useMemo(() => {
    if (!compareOn) return null
    const url = new URL(query, "http://local")
    if (compareStrategy === "all") url.searchParams.delete("strategy")
    else url.searchParams.set("strategy", compareStrategy)
    url.searchParams.set("session", compareSession)
    return `/api/funded-roadmap?${url.searchParams.toString()}`
  }, [compareOn, query, compareStrategy, compareSession])

  const { data, error, isLoading, isValidating } = useSWR<RoadmapResponse>(
    activeAccountId ? [query, activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
    { keepPreviousData: true },
  )
  const compare = useSWR<RoadmapResponse>(
    compareOn && activeAccountId && compareQuery ? [compareQuery, activeAccountId, switchVersion, "cmp"] : null,
    ([url]) => fetcher(url),
    { keepPreviousData: true },
  )

  if (isLoading && !data) return <FundedRoadmapSkeleton />

  if (error && !data) {
    return (
      <HudPanel className="p-8 text-center text-rose-400">
        Failed to load the funded roadmap. Please try again.
      </HudPanel>
    )
  }

  if (!data || data.profile.closedTrades === 0) {
    return (
      <div className="space-y-6">
        <Header />
        <FilterBar
          source={source}
          setSource={setSource}
          range={range}
          setRange={setRange}
          strategy={strategy}
          setStrategy={setStrategy}
          instrument={instrument}
          setInstrument={setInstrument}
          direction={direction}
          setDirection={setDirection}
          session={session}
          setSession={setSession}
          weekday={weekday}
          setWeekday={setWeekday}
          strategies={data?.strategies ?? []}
          instruments={data?.instruments ?? []}
          timezone={data?.timezone}
        />
        <HudPanel className="flex flex-col items-center gap-4 px-6 py-16 text-center">
          <Map className="h-12 w-12 text-cyan-400/50" />
          <div>
            <p className="font-medium">Not enough data to generate a reliable roadmap.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Minimum recommended: 100 closed trades. Import from Live Sync or widen the filter.
            </p>
          </div>
          <Button asChild variant="outline" className="border-cyan-400/30 text-cyan-200">
            <Link href="/live-sync">Go to Live Sync</Link>
          </Button>
        </HudPanel>
      </div>
    )
  }

  const current = data.stages[0]
  const pf = data.profile.profitFactor === Infinity ? "∞" : data.profile.profitFactor.toFixed(2)
  const lowN = data.profile.closedTrades < 100

  return (
    <div className="space-y-6">
      <Header validating={isValidating} />

      <FilterBar
        source={source}
        setSource={setSource}
        range={range}
        setRange={setRange}
        strategy={strategy}
        setStrategy={setStrategy}
        instrument={instrument}
        setInstrument={setInstrument}
        direction={direction}
        setDirection={setDirection}
        session={session}
        setSession={setSession}
        weekday={weekday}
        setWeekday={setWeekday}
        strategies={data.strategies}
        instruments={data.instruments}
        timezone={data.timezone}
      />

      <HudPanel glow="green" className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="hud-label">Funded roadmap</p>
          <Badge variant="outline" className="border-cyan-400/30 text-cyan-200">
            Data Source: {data.sourceLabel}
          </Badge>
          <Badge variant="outline" className="border-white/10 text-muted-foreground">
            {data.filterLabel}
          </Badge>
          {data.profile.rMethod === "median_loss" ? (
            <Badge variant="outline" className="border-amber-400/30 text-amber-200">
              Estimated R (stop-loss missing)
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-400/30 text-emerald-200">
              R from stop-loss
            </Badge>
          )}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Strategy edge</p>
            <p className="mt-1 text-lg font-semibold text-cyan-100">
              {data.profile.winRate.toFixed(1)}% WR · {formatRr(data.profile.avgRrRatio)} · +
              {data.profile.expectancyR.toFixed(2)}R · PF {pf}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current goal</p>
            <p className="mt-1 text-lg font-semibold text-cyan-100">
              {current?.label} · Target {currency.format(current?.profitTarget ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Risk {money.format(current?.riskPerTrade ?? 0)} / trade
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Happy flow</p>
            <p className="mt-1 text-lg font-semibold text-emerald-300">
              {formatDays(data.happyFlowDays)}
            </p>
            <p className="text-xs text-muted-foreground">Optimistic statistical projection</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Long-term goal</p>
            <p className="mt-1 text-lg font-semibold text-cyan-100">$1M funded capital</p>
            <p className="text-xs text-muted-foreground">{data.profile.closedTrades} closed trades in filter</p>
          </div>
        </div>
      </HudPanel>

      {lowN ? (
        <HudPanel glow="red" className="flex items-start gap-3 p-4 text-sm text-rose-100">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Only {data.profile.closedTrades} trades — below the 100-trade recommendation. Raw stats are shown.
            Every timeline is marked <span className="font-semibold">Low confidence</span>.
          </p>
        </HudPanel>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Win rate" value={`${data.profile.winRate.toFixed(1)}%`} hint={`${data.profile.closedTrades} closed trades`} />
        <Kpi title="Average RR" value={formatRr(data.profile.avgRrRatio)} hint={`Win ${data.profile.avgWinR.toFixed(2)}R / Loss ${data.profile.avgLossR.toFixed(2)}R`} />
        <Kpi title="Profit factor" value={pf} hint={`Dollar expectancy ${money.format(data.profile.expectancyUsd)}`} />
        <Kpi
          title="Expectancy"
          value={`${data.profile.expectancyR >= 0 ? "+" : ""}${data.profile.expectancyR.toFixed(2)}R`}
          tone={data.profile.expectancyR > 0 ? "up" : "down"}
          hint="From actual R-multiples, not account P&L"
        />
        <Kpi title="Avg trades / week" value={data.profile.avgTradesPerWeek.toFixed(1)} hint={`Median ${data.profile.medianTradesPerWeek.toFixed(1)} · ${data.profile.avgTradesPerDay.toFixed(1)} / day`} />
        <Kpi title="Max drawdown" value={`${data.profile.maxDrawdownPct.toFixed(1)}%`} hint={money.format(data.profile.maxDrawdown)} tone="down" />
        <Kpi title="Worst loss streak" value={String(data.profile.worstLossStreak)} hint={`Best win streak ${data.profile.bestWinStreak}`} />
        <Kpi
          title="Best / worst day"
          value={data.profile.bestDay ? money.format(data.profile.bestDay.pnl) : "—"}
          hint={data.profile.worstDay ? `Worst ${money.format(data.profile.worstDay.pnl)}` : undefined}
        />
        <Kpi
          title="Best / worst week"
          value={data.profile.bestWeek ? money.format(data.profile.bestWeek.pnl) : "—"}
          hint={data.profile.worstWeek ? `Worst ${money.format(data.profile.worstWeek.pnl)}` : undefined}
        />
        <Kpi title="Average win" value={money.format(data.profile.avgWin)} hint={`${data.profile.avgWinR.toFixed(2)}R`} tone="up" />
        <Kpi title="Average loss" value={money.format(Math.abs(data.profile.avgLoss))} hint={`${data.profile.avgLossR.toFixed(2)}R`} tone="down" />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <HudPanel>
          <HudPanelHeader title="Risk engine" description="Roadmap recalculates when risk or rules change." />
          <div className="space-y-4 p-5">
            <Tabs value={riskMode} onValueChange={(value) => setRiskMode(value as RiskMode)}>
              <TabsList className="border border-cyan-400/20 bg-[#05070a]">
                <TabsTrigger value="percent" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
                  % of equity
                </TabsTrigger>
                <TabsTrigger value="fixed" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
                  Fixed $
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {riskMode === "percent" ? (
              <div className="flex flex-wrap gap-2">
                {RISK_PERCENT_PRESETS.map((value) => (
                  <Button
                    key={value}
                    size="sm"
                    variant={riskPercent === value && !customRisk ? "default" : "outline"}
                    className="border-cyan-400/20"
                    onClick={() => {
                      setRiskPercent(value)
                      setCustomRisk("")
                    }}
                  >
                    {value.toFixed(2)}%
                  </Button>
                ))}
                <Input
                  value={customRisk}
                  onChange={(event) => setCustomRisk(event.target.value)}
                  placeholder="Custom %"
                  className="w-28 border-cyan-400/20 bg-transparent"
                />
              </div>
            ) : (
              <Input
                value={fixedRisk}
                onChange={(event) => setFixedRisk(event.target.value)}
                placeholder="Dollars per trade"
                className="max-w-xs border-cyan-400/20 bg-transparent"
              />
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs text-muted-foreground">
                Firm preset
                <Select
                  value={preset}
                  onValueChange={(value) => {
                    setPreset(value)
                    const next = FUNDED_FIRM_PRESETS.find((item) => item.id === value)
                    if (next) setRules(next.rules)
                  }}
                >
                  <SelectTrigger className="border-cyan-400/20 bg-transparent text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNDED_FIRM_PRESETS.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {(
                [
                  ["profitTargetPct", "Profit target %"],
                  ["maxDrawdownPct", "Max drawdown %"],
                  ["dailyDrawdownPct", "Daily drawdown %"],
                  ["profitSplitPct", "Profit split %"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-1 text-xs text-muted-foreground">
                  {label}
                  <Input
                    type="number"
                    value={rules[key]}
                    onChange={(event) =>
                      setRules((current) => ({ ...current, [key]: Number(event.target.value) || 0 }))
                    }
                    className="border-cyan-400/20 bg-transparent text-foreground"
                  />
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Recommended {data.recommendation.recommended.toFixed(2)}% · Conservative{" "}
              {data.recommendation.conservative.toFixed(2)}% · Aggressive {data.recommendation.aggressive.toFixed(2)}%.{" "}
              {data.recommendation.note}
            </p>
          </div>
        </HudPanel>

        <HudPanel>
          <HudPanelHeader
            title="Drawdown safety"
            description="Historical max drawdown is not a guaranteed future maximum."
            action={
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="text-muted-foreground">
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Historical maximum losing streak is not a guaranteed future maximum. Stress cases use 1.5× and 2× that streak.
                </TooltipContent>
              </Tooltip>
            }
          />
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <Kpi title="Historical streak" value={`${data.stress.historicalStreak}`} hint={`${data.stress.historicalDdPct.toFixed(1)}% max DD`} />
            <Kpi title="Stress 1.5×" value={`${data.stress.stress1Streak} losses`} hint={`${data.stages[0]?.oneR ? money.format(data.stress.stress1Streak * data.stages[0].oneR) : ""}`} />
            <Kpi title="Stress 2×" value={`${data.stress.stress2Streak} losses`} hint={`${data.stages[0] ? `${data.stages[0].stressDdPct.toFixed(1)}% of ${data.stages[0].shortLabel}` : ""}`} tone="down" />
          </div>
          <p className="px-5 pb-5 text-xs text-muted-foreground">
            Internal strategy stability score: {data.confidence.score}/100 · {data.confidence.level}. Projection
            confidence: {data.confidence.projectionLevel}. This is not a scientifically validated probability.
          </p>
        </HudPanel>
      </div>

      {current ? (
        <HudPanel>
          <HudPanelHeader
            title={`${current.shortLabel} challenge progress`}
            description="Backtest projection — no live funded equity is stored, so this is not mixed with live results."
          />
          <div className="space-y-3 p-5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$0</span>
              <span>{currency.format(current.profitTarget)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[8%] rounded-full bg-cyan-400/80" />
            </div>
            <p className="text-sm text-cyan-100">
              Progress: projection only · Target {currency.format(current.profitTarget)} · 1R{" "}
              {money.format(current.oneR)}
            </p>
          </div>
        </HudPanel>
      ) : null}

      <HudPanel glow="green">
        <HudPanelHeader
          title="Happy flow"
          description="Optimistic statistical projection — not a guarantee."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {data.stages.map((stage) => (
            <div key={stage.id} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3">
              <p className="text-xs text-muted-foreground">{stage.shortLabel}</p>
              <p className="mt-1 text-lg font-semibold text-emerald-200">{formatDays(stage.optimisticDays)}</p>
              <p className="text-xs text-muted-foreground">{stage.optimisticTrades ?? "—"} trades</p>
            </div>
          ))}
        </div>
        <p className="px-5 pb-5 text-sm text-emerald-100">
          Projected happy-flow timeline: {formatDays(data.happyFlowDays)}
          {data.happyFlowWeeks != null ? ` / ${data.happyFlowWeeks.toFixed(1)} weeks` : ""}
          {data.happyFlowMonths != null ? ` / ${data.happyFlowMonths.toFixed(1)} months` : ""}
        </p>
      </HudPanel>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {data.stages.map((stage) => (
          <HudPanel key={stage.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-cyan-100">{stage.label} funded</p>
              <Badge variant="outline" className={statusClass(stage.status)}>
                {stage.status}
              </Badge>
            </div>
            <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
              <Row label="Risk / trade" value={money.format(stage.riskPerTrade)} />
              <Row label="Profit target" value={currency.format(stage.profitTarget)} />
              <Row label="Target" value={`${stage.targetR.toFixed(1)}R`} />
              <Row label="Expected trades" value={stage.expectedTrades?.toFixed(0) ?? "—"} />
              <Row label="Happy flow" value={`${stage.optimisticTrades?.toFixed(0) ?? "—"} · ${formatDays(stage.optimisticDays)}`} />
              <Row label="Base case" value={`${stage.baseTrades?.toFixed(0) ?? "—"} · ${formatDays(stage.baseDays)}`} />
              <Row label="Conservative" value={`${stage.conservativeTrades?.toFixed(0) ?? "—"} · ${formatDays(stage.conservativeDays)}`} />
              <Row label="Historical DD" value={`${stage.historicalDdPct.toFixed(1)}%`} />
              <Row label="Stress DD" value={`${stage.stressDdPct.toFixed(1)}%`} />
              <Row label="Reach target" value={`${stage.monteCarlo.targetHitPct.toFixed(0)}%`} />
              <Row label="Hit max DD first" value={`${stage.monteCarlo.drawdownFirstPct.toFixed(0)}%`} />
            </dl>
          </HudPanel>
        ))}
      </div>

      <HudPanel>
        <HudPanelHeader
          title="Target probability"
          description={`${current?.shortLabel ?? "$5K"} challenge · 1,000 simulations of your actual R-multiples`}
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi title="Reach target" value={`${current?.monteCarlo.targetHitPct.toFixed(0) ?? 0}%`} tone="up" />
          <Kpi title="Hit max DD first" value={`${current?.monteCarlo.drawdownFirstPct.toFixed(0) ?? 0}%`} tone="down" />
          <Kpi title="Median trades" value={current?.monteCarlo.medianTradesToTarget?.toFixed(0) ?? "—"} hint={`Best 10% ${current?.monteCarlo.p10TradesToTarget ?? "—"} · Worst 10% ${current?.monteCarlo.p90TradesToTarget ?? "—"}`} />
          <Kpi title="P5 / P95 trades" value={`${current?.monteCarlo.p5TradesToTarget ?? "—"} / ${current?.monteCarlo.p95TradesToTarget ?? "—"}`} />
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader
          title="Strategy comparison"
          description="A tighter filter can look better because the sample shrank — check trade count."
          action={
            <Button size="sm" variant="outline" className="border-cyan-400/20" onClick={() => setCompareOn((value) => !value)}>
              {compareOn ? "Hide compare" : "Compare filter"}
            </Button>
          }
        />
        {compareOn ? (
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap gap-2">
              <Select value={compareStrategy} onValueChange={setCompareStrategy}>
                <SelectTrigger className="w-[180px] border-cyan-400/20 bg-transparent">
                  <SelectValue placeholder="Compare strategy" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All strategies</SelectItem>
                  {data.strategies.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={compareSession} onValueChange={(value) => setCompareSession(value as SessionFilter)}>
                <SelectTrigger className="w-[150px] border-cyan-400/20 bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All sessions</SelectItem>
                  <SelectItem value="asia">Asia</SelectItem>
                  <SelectItem value="london">London</SelectItem>
                  <SelectItem value="newyork">New York</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <CompareCard title={data.snapshot.label} row={data.snapshot} />
              <CompareCard
                title={compare.data?.snapshot.label ?? "Loading…"}
                row={compare.data?.snapshot}
              />
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted-foreground">
            Compare the current filter against another strategy or session without leaving this page.
          </p>
        )}
      </HudPanel>

      <HudPanel>
        <HudPanelHeader
          title="Long-term scaling roadmap"
          description="Statistical projection — not a guaranteed timeline."
          action={
            <Select value={scenario} onValueChange={(value) => setScenario(value as ScenarioKey)}>
              <SelectTrigger className="w-[150px] border-cyan-400/20 bg-transparent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optimistic">Optimistic</SelectItem>
                <SelectItem value="base">Base</SelectItem>
                <SelectItem value="conservative">Conservative</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <div className="overflow-x-auto p-5">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="pb-2">Stage</th>
                <th className="pb-2">Target</th>
                <th className="pb-2">Risk / trade</th>
                <th className="pb-2">Expected profit</th>
                <th className="pb-2">Drawdown buffer</th>
                <th className="pb-2">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.stages.map((stage) => {
                const days =
                  scenario === "optimistic"
                    ? stage.optimisticDays
                    : scenario === "conservative"
                      ? stage.conservativeDays
                      : stage.baseDays
                return (
                  <tr key={stage.id} className="border-t border-white/5">
                    <td className="py-2 text-cyan-100">{stage.shortLabel}</td>
                    <td>{currency.format(stage.profitTarget)}</td>
                    <td>{money.format(stage.riskPerTrade)}</td>
                    <td>{currency.format(stage.profitTarget)}</td>
                    <td>{currency.format(stage.drawdownLimit)}</td>
                    <td>{formatDays(days)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-cyan-100">
            $5K → $1M ({scenario}): {formatDays(data.totalDays[scenario])}
          </p>
        </div>
      </HudPanel>

      <FundedRoadmapCharts model={data} />
    </div>
  )
}

function Header({ validating }: { validating?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="hud-label">Trading</p>
        <h1 className="text-2xl font-semibold tracking-tight text-cyan-50">Funded Roadmap</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Challenge path from your actual trades — not hardcoded win rate or 1:3 RR.
        </p>
      </div>
      {validating ? <p className="text-xs text-cyan-300/70">Updating…</p> : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt>{label}</dt>
      <dd className="text-cyan-100">{value}</dd>
    </div>
  )
}

function CompareCard({ title, row }: { title: string; row?: CompareSnapshot }) {
  return (
    <div className="rounded-lg border border-cyan-400/15 p-4">
      <p className="text-sm font-semibold text-cyan-100">{title}</p>
      {row ? (
        <dl className="mt-3 space-y-1 text-xs text-muted-foreground">
          <Row label="Win rate" value={`${row.winRate.toFixed(1)}%`} />
          <Row label="RR" value={formatRr(row.avgRrRatio)} />
          <Row label="PF" value={row.profitFactor === Infinity ? "∞" : row.profitFactor.toFixed(2)} />
          <Row label="Expectancy" value={`${row.expectancyR.toFixed(2)}R`} />
          <Row label="Max DD" value={`${row.maxDrawdownPct.toFixed(1)}%`} />
          <Row label="Trades" value={String(row.closedTrades)} />
          <Row label="Trades / week" value={row.avgTradesPerWeek.toFixed(1)} />
          <Row label="Happy-flow time" value={formatDays(row.estimatedDays)} />
        </dl>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Loading comparison…</p>
      )}
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
  direction,
  setDirection,
  session,
  setSession,
  weekday,
  setWeekday,
  strategies,
  instruments,
  timezone,
}: {
  source: SourceFilter
  setSource: (value: SourceFilter) => void
  range: RangePreset
  setRange: (value: RangePreset) => void
  strategy: string
  setStrategy: (value: string) => void
  instrument: string
  setInstrument: (value: string) => void
  direction: DirectionFilter
  setDirection: (value: DirectionFilter) => void
  session: SessionFilter
  setSession: (value: SessionFilter) => void
  weekday: WeekdayFilter
  setWeekday: (value: WeekdayFilter) => void
  strategies: string[]
  instruments: string[]
  timezone?: string
}) {
  return (
    <HudPanel className="px-4 py-3">
      <div className="flex flex-col gap-3">
        <Tabs value={source} onValueChange={(value) => setSource(value as SourceFilter)}>
          <TabsList className="border border-cyan-400/20 bg-[#05070a]">
            <TabsTrigger value="all" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
              All
            </TabsTrigger>
            <TabsTrigger value="tradingview" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
              Backtest
            </TabsTrigger>
            <TabsTrigger value="manual" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">
              Live / Manual
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={(value) => setRange(value as RangePreset)}>
            <SelectTrigger className="w-[130px] border-cyan-400/20 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger className="w-[150px] border-cyan-400/20 bg-transparent">
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
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="w-[180px] border-cyan-400/20 bg-transparent">
              <SelectValue placeholder="Strategy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All strategies</SelectItem>
              {strategies.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={direction} onValueChange={(value) => setDirection(value as DirectionFilter)}>
            <SelectTrigger className="w-[130px] border-cyan-400/20 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Both sides</SelectItem>
              <SelectItem value="long">Long</SelectItem>
              <SelectItem value="short">Short</SelectItem>
            </SelectContent>
          </Select>
          <Select value={session} onValueChange={(value) => setSession(value as SessionFilter)}>
            <SelectTrigger className="w-[140px] border-cyan-400/20 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sessions</SelectItem>
              <SelectItem value="asia">Asia</SelectItem>
              <SelectItem value="london">London</SelectItem>
              <SelectItem value="newyork">New York</SelectItem>
            </SelectContent>
          </Select>
          <Select value={weekday} onValueChange={(value) => setWeekday(value as WeekdayFilter)}>
            <SelectTrigger className="w-[130px] border-cyan-400/20 bg-transparent">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All days</SelectItem>
              {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => (
                <SelectItem key={day} value={day}>
                  {day}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
