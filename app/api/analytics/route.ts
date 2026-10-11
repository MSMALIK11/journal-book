import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { computeAnalytics, computePeriodComparison } from "@/lib/trading/analytics"
import {
  ANALYTICS_TRADE_SELECT,
  EXIT_ATTRIBUTION_LOOKBACK_DAYS,
  buildTradeQuery,
  fetchClosedTradesWithMeta,
  previousPeriodDates,
  validateDateRange,
} from "@/lib/trading/trade-query"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    const { accountId, account } = await getAccountContext(request, session.sub)
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
    const initialCapital =
      typeof account.initialCapital === "number" && account.initialCapital > 0
        ? account.initialCapital
        : null

    const queryParams = { source, strategy, instrument, startDate, endDate }
    // Days mean calendar days in the user's timezone, and a trade belongs to the day it closed,
    // so the entry_date bound has to reach further back than the window itself.
    const queryOptions = { timezone, exitAttributionLookbackDays: EXIT_ATTRIBUTION_LOOKBACK_DAYS }
    const attribution = { startDate, endDate, lookbackDays: EXIT_ATTRIBUTION_LOOKBACK_DAYS }

    const { trades, meta } = await fetchClosedTradesWithMeta(
      buildTradeQuery(session.sub, accountId, queryParams, queryOptions),
      ANALYTICS_TRADE_SELECT,
    )
    const analytics = computeAnalytics(trades, { timezone, initialCapital, attribution })
    analytics.meta = meta

    if (startDate && endDate) {
      const previous = previousPeriodDates(startDate, endDate)
      const { trades: previousTrades } = await fetchClosedTradesWithMeta(
        buildTradeQuery(
          session.sub,
          accountId,
          { ...queryParams, startDate: previous.startDate, endDate: previous.endDate },
          queryOptions,
        ),
        ANALYTICS_TRADE_SELECT,
      )
      const previousAnalytics = computeAnalytics(previousTrades, {
        timezone,
        initialCapital,
        attribution: {
          startDate: previous.startDate,
          endDate: previous.endDate,
          lookbackDays: EXIT_ATTRIBUTION_LOOKBACK_DAYS,
        },
      })
      analytics.comparison = computePeriodComparison(
        analytics.overview,
        previousAnalytics.overview,
        `${previous.label} (by exit date)`,
      )
    }

    return NextResponse.json(analytics, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("Analytics API error:", error)
    return NextResponse.json({ error: "Failed to compute analytics" }, { status: 500 })
  }
}
