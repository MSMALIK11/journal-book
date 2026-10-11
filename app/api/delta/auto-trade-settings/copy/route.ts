import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { isServerLiveTradingBlocked } from "@/lib/broker/delta-live-guard"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import { DELTA_LEVERAGE_STEPS } from "@/lib/broker/delta-product"
import {
  DELTA_AUTO_TRADE_SYMBOLS,
  getDeltaAutoTradeConfig,
  normalizeDeltaAutoTradeConfig,
  type DeltaAutoTradePreferences,
  type DeltaLeverageBySymbol,
  type DeltaLotSizeBySymbol,
} from "@/lib/delta/auto-trade-settings"
import { getSession } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    if (environment !== "live") {
      return NextResponse.json(
        { error: "Copy is only available from the live environment" },
        { status: 400 },
      )
    }

    await connectDB()
    const user = await User.findById(session.sub).select("deltaAutoTradePreferences").lean()
    const demo = getDeltaAutoTradeConfig(user?.deltaAutoTradePreferences, "demo")

    const liveMaxOrderSize = getDeltaOrderMaxSize("live")
    const lotSizeBySymbol: DeltaLotSizeBySymbol = {}
    const leverageBySymbol: DeltaLeverageBySymbol = {}
    const droppedLots: string[] = []
    for (const sym of DELTA_AUTO_TRADE_SYMBOLS) {
      const lots = demo.lotSizeBySymbol?.[sym]
      if (lots != null) {
        if (lots <= liveMaxOrderSize) lotSizeBySymbol[sym] = lots
        else droppedLots.push(sym)
      }
      const leverage = demo.leverageBySymbol?.[sym]
      if (
        leverage != null &&
        DELTA_LEVERAGE_STEPS.includes(leverage as (typeof DELTA_LEVERAGE_STEPS)[number])
      ) {
        leverageBySymbol[sym] = leverage
      }
    }

    // Demo account IDs are meaningless on live — start disabled with no accounts so nothing
    // trades until the user explicitly picks live accounts and flips the switch.
    const next = normalizeDeltaAutoTradeConfig({
      enabled: false,
      tradeMode: demo.tradeMode,
      singleAccountId: undefined,
      broadcastAccountIds: [],
      symbol: demo.symbol,
      symbols: demo.symbols,
      marginPct: demo.marginPct,
      leverageBySymbol,
      lotSizeBySymbol,
      attachTvBrackets: demo.attachTvBrackets,
      closeOnTvExit: demo.closeOnTvExit,
    })

    if (next.enabled && isServerLiveTradingBlocked()) {
      return NextResponse.json(
        { error: "Live trading is blocked on this server (DELTA_LIVE_ENABLED=false)" },
        { status: 400 },
      )
    }

    const prefs: DeltaAutoTradePreferences = {
      ...(user?.deltaAutoTradePreferences ?? {}),
      live: next,
    }

    await User.findByIdAndUpdate(session.sub, { $set: { deltaAutoTradePreferences: prefs } })

    return NextResponse.json({
      environment: "live",
      config: next,
      liveMaxOrderSize,
      droppedLots,
    })
  } catch (error) {
    console.error("Failed to copy Delta auto-trade settings:", error)
    return NextResponse.json({ error: "Unable to copy auto-trade settings" }, { status: 500 })
  }
}
