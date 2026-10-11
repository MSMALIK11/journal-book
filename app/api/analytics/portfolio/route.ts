import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import {
  ANALYTICS_TRADE_SELECT,
  EXIT_ATTRIBUTION_LOOKBACK_DAYS,
  buildTradeQuery,
  fetchClosedTradesWithMeta,
  validateDateRange,
} from "@/lib/trading/trade-query"
import { computePortfolioAnalytics, PORTFOLIO_ACCOUNT_CAP } from "@/lib/trading/portfolio-analytics"
import { formatAccount, getUserAccounts } from "@/lib/trading-accounts-server"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()

    const { searchParams } = new URL(request.url)
    const source = searchParams.get("source") || "all"
    const strategy = searchParams.get("strategy")
    const instrument = searchParams.get("instrument")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")

    const dateError = validateDateRange(startDate, endDate)
    if (dateError) return NextResponse.json({ error: dateError }, { status: 400 })

    const [user, rawAccounts] = await Promise.all([
      User.findById(session.sub).select("timezone").lean(),
      getUserAccounts(session.sub),
    ])
    const timezone = user?.timezone || "Asia/Karachi"

    const accounts = rawAccounts.map(formatAccount)
    const capped = accounts.slice(0, PORTFOLIO_ACCOUNT_CAP)
    const accountIds = capped.map((a) => a.id)

    if (!accountIds.length) {
      return NextResponse.json({ error: "No trading accounts found" }, { status: 404 })
    }

    const queryParams = { source, strategy, instrument, startDate, endDate }
    const queryOptions = {
      timezone,
      exitAttributionLookbackDays: EXIT_ATTRIBUTION_LOOKBACK_DAYS,
      accountIds,
    }

    const { trades, meta } = await fetchClosedTradesWithMeta(
      buildTradeQuery(session.sub, accountIds[0], queryParams, queryOptions),
      ANALYTICS_TRADE_SELECT,
    )

    const portfolio = computePortfolioAnalytics(trades, capped, { timezone })
    portfolio.merged.meta = meta

    return NextResponse.json(
      {
        ...portfolio,
        timezone,
        accountCount: capped.length,
        accountsSkipped: accounts.length - capped.length,
        meta: { ...meta, accountsCapped: accounts.length > capped.length },
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Portfolio analytics API error:", error)
    return NextResponse.json({ error: "Failed to compute portfolio analytics" }, { status: 500 })
  }
}
