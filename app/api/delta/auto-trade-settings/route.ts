import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getRecentAutoTradeLogs } from "@/lib/broker/delta-auto-trade"
import { listEnabledDeltaAccounts } from "@/lib/broker/delta-credentials"
import { assertLiveTradingEnabled, isServerLiveTradingBlocked } from "@/lib/broker/delta-live-guard"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import {
  DELTA_AUTO_TRADE_SYMBOLS,
  getDeltaAutoTradeConfig,
  normalizeDeltaAutoTradeConfig,
  type DeltaAutoTradePreferences,
} from "@/lib/delta/auto-trade-settings"
import { DELTA_LEVERAGE_STEPS } from "@/lib/broker/delta-product"
import { getSession } from "@/lib/session"

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  tradeMode: z.enum(["single", "broadcast"]).optional(),
  singleAccountId: z.string().optional(),
  broadcastAccountIds: z.array(z.string()).optional(),
  symbol: z.enum(DELTA_AUTO_TRADE_SYMBOLS).optional(),
  symbols: z.array(z.enum(DELTA_AUTO_TRADE_SYMBOLS)).min(1).optional(),
  marginPct: z.number().int().min(1).max(100).optional(),
  leverage: z.number().int().positive().optional(),
  lotSize: z.number().int().positive().nullable().optional(),
  leverageBySymbol: z
    .record(z.enum(DELTA_AUTO_TRADE_SYMBOLS), z.number().int().positive())
    .optional(),
  lotSizeBySymbol: z
    .record(z.enum(DELTA_AUTO_TRADE_SYMBOLS), z.number().int().positive().nullable())
    .optional(),
  attachTvBrackets: z.boolean().optional(),
  closeOnTvExit: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const user = await User.findById(session.sub).select("deltaAutoTradePreferences").lean()
    let config = getDeltaAutoTradeConfig(user?.deltaAutoTradePreferences, environment)
    const enabledAccounts = await listEnabledDeltaAccounts(session.sub, environment)

    if (config.tradeMode === "single" && !config.singleAccountId && enabledAccounts.length > 0) {
      config = {
        ...config,
        singleAccountId: enabledAccounts.find((a) => a.isDefault)?.id ?? enabledAccounts[0].id,
      }
    }
    if (
      config.tradeMode === "broadcast" &&
      (config.broadcastAccountIds?.length ?? 0) === 0 &&
      enabledAccounts.length > 0
    ) {
      config = { ...config, broadcastAccountIds: enabledAccounts.map((a) => a.id) }
    }

    const recentLogs = await getRecentAutoTradeLogs(session.sub, environment)

    return NextResponse.json({
      environment,
      config,
      recentLogs,
      serverLiveBlocked: isServerLiveTradingBlocked(),
    })
  } catch (error) {
    console.error("Failed to load Delta auto-trade settings:", error)
    return NextResponse.json({ error: "Unable to load auto-trade settings" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid auto-trade payload" }, { status: 400 })
    }

    await connectDB()
    const user = await User.findById(session.sub).select("deltaAutoTradePreferences").lean()
    const current = getDeltaAutoTradeConfig(user?.deltaAutoTradePreferences, environment)
    const {
      leverage: leveragePatch,
      lotSize: lotSizePatch,
      leverageBySymbol: leverageMapPatch,
      lotSizeBySymbol: lotSizeMapPatch,
      ...rest
    } = parsed.data

    const maxOrderSize = getDeltaOrderMaxSize(environment)

    if (leveragePatch != null && !DELTA_LEVERAGE_STEPS.includes(leveragePatch as (typeof DELTA_LEVERAGE_STEPS)[number])) {
      return NextResponse.json({ error: "Unsupported leverage value" }, { status: 400 })
    }
    if (lotSizePatch != null && lotSizePatch > maxOrderSize) {
      return NextResponse.json(
        { error: `Lot size exceeds the ${maxOrderSize} Lot per-order limit` },
        { status: 400 },
      )
    }
    for (const [sym, leverage] of Object.entries(leverageMapPatch ?? {})) {
      if (!DELTA_LEVERAGE_STEPS.includes(leverage as (typeof DELTA_LEVERAGE_STEPS)[number])) {
        return NextResponse.json({ error: `Unsupported leverage value for ${sym}` }, { status: 400 })
      }
    }
    for (const [sym, lots] of Object.entries(lotSizeMapPatch ?? {})) {
      if (lots != null && lots > maxOrderSize) {
        return NextResponse.json(
          { error: `Lot size for ${sym} exceeds the ${maxOrderSize} Lot per-order limit` },
          { status: 400 },
        )
      }
    }

    const symbolForLeverage = rest.symbol ?? current.symbol
    const leverageBySymbol = { ...current.leverageBySymbol }
    for (const sym of DELTA_AUTO_TRADE_SYMBOLS) {
      const next = leverageMapPatch?.[sym]
      if (next != null) leverageBySymbol[sym] = next
    }
    if (leveragePatch != null) leverageBySymbol[symbolForLeverage] = leveragePatch

    const lotSizeBySymbol = { ...current.lotSizeBySymbol }
    for (const sym of DELTA_AUTO_TRADE_SYMBOLS) {
      const next = lotSizeMapPatch?.[sym]
      if (next === undefined) continue
      if (next === null) delete lotSizeBySymbol[sym]
      else lotSizeBySymbol[sym] = next
    }
    if (lotSizePatch === null) {
      delete lotSizeBySymbol[symbolForLeverage]
    } else if (lotSizePatch != null) {
      lotSizeBySymbol[symbolForLeverage] = lotSizePatch
    }

    const next = normalizeDeltaAutoTradeConfig({
      ...current,
      ...rest,
      leverageBySymbol,
      lotSizeBySymbol,
    })

    if (next.enabled && environment === "live") {
      if (isServerLiveTradingBlocked()) {
        return NextResponse.json(
          { error: "Live trading is blocked on this server (DELTA_LIVE_ENABLED=false)" },
          { status: 400 },
        )
      }
      try {
        await assertLiveTradingEnabled(session.sub)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Live trading is not enabled"
        return NextResponse.json({ error: message }, { status: 400 })
      }
    }

    const enabledAccounts = await listEnabledDeltaAccounts(session.sub, environment)
    const enabledIds = new Set(enabledAccounts.map((a) => a.id))

    if (next.tradeMode === "single" && next.singleAccountId && !enabledIds.has(next.singleAccountId)) {
      return NextResponse.json({ error: "Selected account is not enabled" }, { status: 400 })
    }

    if (next.tradeMode === "broadcast" && (next.broadcastAccountIds?.length ?? 0) > 0) {
      const invalid = next.broadcastAccountIds?.some((id) => !enabledIds.has(id))
      if (invalid) {
        return NextResponse.json({ error: "One or more broadcast accounts are not enabled" }, { status: 400 })
      }
    }

    const prefs: DeltaAutoTradePreferences = {
      ...(user?.deltaAutoTradePreferences ?? {}),
      [environment]: next,
    }

    await User.findByIdAndUpdate(session.sub, { $set: { deltaAutoTradePreferences: prefs } })

    return NextResponse.json({
      environment,
      config: next,
      recentLogs: await getRecentAutoTradeLogs(session.sub, environment),
    })
  } catch (error) {
    console.error("Failed to update Delta auto-trade settings:", error)
    return NextResponse.json({ error: "Unable to update auto-trade settings" }, { status: 500 })
  }
}
