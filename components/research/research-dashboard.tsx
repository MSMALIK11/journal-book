"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { format, subDays } from "date-fns"
import Link from "next/link"
import { Microscope } from "lucide-react"
import { BehaviorPatterns } from "@/components/research/behavior-patterns"
import { MarketPatterns } from "@/components/research/market-patterns"
import { ResearchDashboardSkeleton } from "@/components/research/research-dashboard-skeleton"
import { ResearchInsights } from "@/components/research/research-insights"
import { StyleProfileCard } from "@/components/research/style-profile"
import { WhatIfTab } from "@/components/research/what-if-tab"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authFetch } from "@/lib/client-auth"
import { useActiveAccount } from "@/hooks/use-active-account"
import type { PeriodComparison, ResearchResult } from "@/lib/trading/research"

type SourceFilter = "all" | "tradingview" | "manual"
type RangePreset = "7d" | "30d" | "90d" | "all"
type ResearchTab = "style" | "market" | "behavior" | "insights" | "whatif"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as ResearchResult
}

function rangeToDates(preset: RangePreset) {
  if (preset === "all") return {}
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90
  return {
    startDate: format(subDays(new Date(), days), "yyyy-MM-dd"),
    endDate: format(new Date(), "yyyy-MM-dd"),
  }
}

export function ResearchDashboard() {
  const { activeAccountId, switchVersion } = useActiveAccount()
  const [source, setSource] = useState<SourceFilter>("all")
  const [range, setRange] = useState<RangePreset>("all")
  const [strategy, setStrategy] = useState("all")
  const [instrument, setInstrument] = useState("all")
  const [activeTab, setActiveTab] = useState<ResearchTab>("style")

  const query = useMemo(() => {
    const params = new URLSearchParams({ source })
    if (strategy !== "all") params.set("strategy", strategy)
    if (instrument !== "all") params.set("instrument", instrument)
    const { startDate, endDate } = rangeToDates(range)
    if (startDate) params.set("startDate", startDate)
    if (endDate) params.set("endDate", endDate)
    return `/api/research?${params.toString()}`
  }, [source, range, strategy, instrument])

  const { data, error, isLoading, isValidating } = useSWR<ResearchResult>(
    activeAccountId ? [query, activeAccountId, switchVersion] : null,
    ([url]) => fetcher(url),
    { keepPreviousData: true },
  )

  if (isLoading && !data) return <ResearchDashboardSkeleton />

  if (error && !data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          Failed to load research insights. Please try again.
        </CardContent>
      </Card>
    )
  }

  if (!data || data.closedTrades === 0) {
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
          strategies={data?.strategies ?? []}
          instruments={data?.instruments ?? []}
          timezone={data?.timezone}
        />
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <Microscope className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="font-medium">Not enough closed trades for pattern research</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Sync trades from Live Sync or add manual entries, then return here to discover your
                trading style and market patterns.
              </p>
            </div>
            <Button asChild variant="outline">
              <Link href="/live-sync">Go to Live Sync</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

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
        strategies={data.strategies}
        instruments={data.instruments}
        timezone={data.timezone}
      />

      {isValidating ? <p className="text-xs text-muted-foreground">Updating patterns…</p> : null}

      {data.comparison ? <ComparisonLine comparison={data.comparison} /> : null}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ResearchTab)}>
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="style">Style</TabsTrigger>
          <TabsTrigger value="market">Market</TabsTrigger>
          <TabsTrigger value="behavior">Behavior</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="whatif">What if</TabsTrigger>
        </TabsList>

        <TabsContent value="style" className="mt-6">
          <StyleProfileCard
            profile={data.styleProfile}
            holdTimeBuckets={data.patterns.holdTimeBuckets}
          />
        </TabsContent>

        <TabsContent value="market" className="mt-6">
          <MarketPatterns patterns={data.patterns} />
        </TabsContent>

        <TabsContent value="behavior" className="mt-6">
          <BehaviorPatterns behavior={data.behavior} journal={data.journal} />
        </TabsContent>

        <TabsContent value="insights" className="mt-6">
          <ResearchInsights recommendations={data.recommendations} />
        </TabsContent>

        <TabsContent value="whatif" className="mt-6">
          <WhatIfTab whatIf={data.whatIf} />
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
    <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <Tabs value={source} onValueChange={(v) => setSource(v as SourceFilter)}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="tradingview">TradingView</TabsTrigger>
          <TabsTrigger value="manual">Manual</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onValueChange={(v) => setRange(v as RangePreset)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>

        {strategies.length > 0 ? (
          <Select value={strategy} onValueChange={setStrategy}>
            <SelectTrigger className="w-[180px]">
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
        ) : null}

        {instruments.length > 0 ? (
          <Select value={instrument} onValueChange={setInstrument}>
            <SelectTrigger className="w-[160px]">
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
        ) : null}

        {timezone ? (
          <Badge variant="outline" className="text-xs">
            Times in {timezone.replace(/_/g, " ")}
          </Badge>
        ) : null}
      </div>
    </div>
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
