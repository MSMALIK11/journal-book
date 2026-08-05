import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { computePeriodComparison } from "@/lib/trading/analytics"
import { computeResearchInsights } from "@/lib/trading/research"
import {
  buildTradeQuery,
  fetchClosedTrades,
  previousPeriodDates,
  RESEARCH_TRADE_SELECT,
  validateDateRange,
} from "@/lib/trading/trade-query"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    const { accountId } = await getAccountContext(request, session.sub)
    const { searchParams } = new URL(request.url)
    const source = searchParams.get("source") || "all"
    const strategy = searchParams.get("strategy")
    const instrument = searchParams.get("instrument")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const dateError = validateDateRange(startDate, endDate)
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 })

    const user = await User.findById(session.sub).select("timezone").lean()
    const timezone = user?.timezone || "Asia/Karachi"

    const queryParams = { source, strategy, instrument, startDate, endDate }
    const query = buildTradeQuery(session.sub, accountId, queryParams)

    const trades = await fetchClosedTrades(query, RESEARCH_TRADE_SELECT)
    const research = computeResearchInsights(trades, { timezone })

    if (startDate && endDate) {
      const previous = previousPeriodDates(startDate, endDate)
      const previousTrades = await fetchClosedTrades(
        buildTradeQuery(session.sub, accountId, {
          ...queryParams,
          startDate: previous.startDate,
          endDate: previous.endDate,
        }),
        RESEARCH_TRADE_SELECT,
      )
      const previousResearch = computeResearchInsights(previousTrades, { timezone })
      research.comparison = computePeriodComparison(
        {
          closedTrades: research.closedTrades,
          netPnl: research.styleProfile.netPnl,
          winRate: research.styleProfile.winRate,
        } as Parameters<typeof computePeriodComparison>[0],
        {
          closedTrades: previousResearch.closedTrades,
          netPnl: previousResearch.styleProfile.netPnl,
          winRate: previousResearch.styleProfile.winRate,
        } as Parameters<typeof computePeriodComparison>[1],
        previous.label,
      )
    }

    return NextResponse.json(research, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("Research API error:", error)
    return NextResponse.json({ error: "Failed to compute research insights" }, { status: 500 })
  }
}
