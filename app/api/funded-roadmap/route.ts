import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { computeAnalytics } from "@/lib/trading/analytics"
import {
  DEFAULT_FUNDED_RULES,
  FUNDED_FIRM_PRESETS,
  type FundedChallengeRules,
  type RiskMode,
} from "@/lib/trading/funded-presets"
import {
  buildFundedRoadmap,
  dataSourceLabel,
  filterFundedTrades,
  filterLabel,
  toCompareSnapshot,
  type DirectionFilter,
  type SessionFilter,
  type WeekdayFilter,
} from "@/lib/trading/funded-roadmap"
import { FUNDED_ACCOUNT_LADDER } from "@/lib/trading/funded-presets"
import { computeRMultipleStats, type FundedTrade } from "@/lib/trading/r-multiples"
import {
  FUNDED_TRADE_SELECT,
  buildTradeQuery,
  fetchClosedTrades,
  validateDateRange,
} from "@/lib/trading/trade-query"

function parseRules(searchParams: URLSearchParams): FundedChallengeRules {
  const preset = FUNDED_FIRM_PRESETS.find((item) => item.id === searchParams.get("preset"))
  const base = preset?.rules ?? DEFAULT_FUNDED_RULES
  // Clamp to sane ranges so a malformed query (e.g. ?maxDrawdownPct=99999)
  // can't turn every simulation into an automatic pass.
  const clamp = (key: string, min: number, max: number, fallback: number) => {
    const raw = Number(searchParams.get(key))
    return Number.isFinite(raw) && raw > 0 ? Math.min(max, Math.max(min, raw)) : fallback
  }
  const profitTargetPct = clamp("profitTargetPct", 1, 100, base.profitTargetPct)
  const maxDrawdownPct = clamp("maxDrawdownPct", 1, 100, base.maxDrawdownPct)
  return {
    profitTargetPct,
    maxDrawdownPct,
    dailyDrawdownPct: Math.min(
      maxDrawdownPct,
      clamp("dailyDrawdownPct", 0.25, 100, base.dailyDrawdownPct),
    ),
    minTradingDays: clamp("minTradingDays", 1, 365, base.minTradingDays),
    profitSplitPct: clamp("profitSplitPct", 1, 100, base.profitSplitPct),
  }
}

function parseFilters(searchParams: URLSearchParams) {
  const direction = (searchParams.get("direction") || "all") as DirectionFilter
  const session = (searchParams.get("session") || "all") as SessionFilter
  const weekday = (searchParams.get("weekday") || "all") as WeekdayFilter
  return {
    source: searchParams.get("source") || "all",
    strategy: searchParams.get("strategy"),
    instrument: searchParams.get("instrument"),
    startDate: searchParams.get("startDate"),
    endDate: searchParams.get("endDate"),
    direction: ["all", "long", "short"].includes(direction) ? direction : "all",
    session: ["all", "asia", "london", "newyork"].includes(session) ? session : "all",
    weekday: ["all", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].includes(weekday)
      ? weekday
      : "all",
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    const { accountId } = await getAccountContext(request, session.sub)
    const { searchParams } = new URL(request.url)
    const filters = parseFilters(searchParams)
    const dateError = validateDateRange(filters.startDate, filters.endDate)
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 })

    const user = await User.findById(session.sub).select("timezone").lean()
    const timezone = user?.timezone || "Asia/Karachi"

    const query = buildTradeQuery(session.sub, accountId, {
      source: filters.source,
      strategy: filters.strategy,
      instrument: filters.instrument,
      startDate: filters.startDate,
      endDate: filters.endDate,
    })
    const rawTrades = (await fetchClosedTrades(query, FUNDED_TRADE_SELECT)) as FundedTrade[]
    const trades = filterFundedTrades(rawTrades, {
      timezone,
      direction: filters.direction,
      session: filters.session,
      weekday: filters.weekday,
    })

    const analytics = computeAnalytics(trades, { timezone })
    const slRStats = computeRMultipleStats(trades)
    const rules = parseRules(searchParams)
    const riskMode = (searchParams.get("riskMode") === "fixed" ? "fixed" : "percent") as RiskMode
    const riskPercent = Number(searchParams.get("riskPercent"))
    const fixedRisk = Number(searchParams.get("fixedRisk"))
    const rawStageIndex = Number(searchParams.get("currentStageIndex") || 0)

    const riskConfig = {
      mode: riskMode,
      riskPercent: Number.isFinite(riskPercent) && riskPercent > 0 ? riskPercent : 1,
      fixedRisk: Number.isFinite(fixedRisk) && fixedRisk > 0 ? fixedRisk : 50,
    }
    const stageIndex = Number.isFinite(rawStageIndex)
      ? Math.max(0, Math.min(FUNDED_ACCOUNT_LADDER.length - 1, Math.round(rawStageIndex)))
      : 0

    const model = buildFundedRoadmap({
      analytics,
      trades,
      slRStats,
      rules,
      risk: riskConfig,
      currentStageIndex: stageIndex,
    })

    const label = filterLabel({
      instrument: filters.instrument ?? undefined,
      strategy: filters.strategy ?? undefined,
      session: filters.session,
      direction: filters.direction,
    })

    return NextResponse.json(
      {
        ...model,
        timezone,
        strategies: analytics.strategies,
        instruments: analytics.instruments,
        source: filters.source,
        sourceLabel: dataSourceLabel(filters.source),
        filterLabel: label,
        snapshot: toCompareSnapshot(label, model, stageIndex),
        rules,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Funded roadmap API error:", error)
    return NextResponse.json({ error: "Failed to compute funded roadmap" }, { status: 500 })
  }
}
