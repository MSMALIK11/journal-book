import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import User from "@/app/api/models/User"
import { computeAnalytics } from "@/lib/trading/analytics"
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

    const query: Record<string, unknown> = {
      userId: session.sub,
      accountId,
      net_pnl: { $exists: true, $ne: null },
    }

    if (source === "tradingview" || source === "manual") {
      query.source = source
    } else if (source === "all") {
      // include manual and tradingview; legacy trades without source count as manual
    }

    if (strategy && strategy !== "all") query.strategy = strategy
    if (instrument && instrument !== "all") query.instrument = instrument

    if (startDate || endDate) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (
        (startDate && !datePattern.test(startDate)) ||
        (endDate && !datePattern.test(endDate))
      ) {
        return NextResponse.json({ error: "Invalid calendar date range" }, { status: 400 })
      }
      query.entry_date = {}
      if (startDate) (query.entry_date as Record<string, Date>).$gte = new Date(`${startDate}T00:00:00.000Z`)
      if (endDate) (query.entry_date as Record<string, Date>).$lte = new Date(`${endDate}T23:59:59.999Z`)
    }

    const user = await User.findById(session.sub).select("timezone").lean()
    const timezone = user?.timezone || "Asia/Karachi"

    const trades = await Trade.find(query)
      .select(
        "entry_date exit_date net_pnl return_pct commission strategy instrument trade_type signal source",
      )
      .sort({ entry_date: 1 })
      .limit(10000)
      .lean()

    const analytics = computeAnalytics(trades, { timezone })

    return NextResponse.json(analytics, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch (error) {
    console.error("Analytics API error:", error)
    return NextResponse.json({ error: "Failed to compute analytics" }, { status: 500 })
  }
}
