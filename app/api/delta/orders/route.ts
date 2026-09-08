import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import mongoose from "mongoose"
import connectDB from "@/app/api/db/mongoose"
import DeltaOrderLog from "@/app/api/models/DeltaOrderLog"
import User from "@/app/api/models/User"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import {
  ineligibleToAccountResult,
  resolveManualBroadcastAccounts,
} from "@/lib/broker/delta-broadcast-sizing"
import { getDeltaTickerPrice } from "@/lib/broker/delta-exchange"
import {
  getDefaultDeltaAccount,
  hasEnvDeltaCredentials,
} from "@/lib/broker/delta-credentials"
import { assertLiveTradingEnabled } from "@/lib/broker/delta-live-guard"
import {
  getDeltaOrderMaxSize,
  placeDeltaMarketOrderBatch,
  placeDeltaMarketOrderForAccount,
} from "@/lib/broker/delta-orders"
import { getDeltaAutoTradeConfig } from "@/lib/delta/auto-trade-settings"
import { persistDeltaTradeNotifications } from "@/lib/delta/delta-trade-notifications"
import { getSession } from "@/lib/session"

const orderSchema = z.object({
  symbol: z.string().min(1).max(32),
  side: z.enum(["buy", "sell"]),
  size: z.number().int().positive(),
  accountId: z.string().optional(),
  accountIds: z.array(z.string()).optional(),
})

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const orders = await DeltaOrderLog.find({
      userId: new mongoose.Types.ObjectId(session.sub),
      environment,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean()

    return NextResponse.json({
      orders: orders.map((order) => ({
        id: order._id.toString(),
        accountId: order.brokerAccountId?.toString(),
        accountLabel: order.accountLabel,
        brokerOrderId: order.brokerOrderId,
        symbol: order.symbol,
        side: order.side,
        size: order.size,
        price: order.price,
        createdAt: order.createdAt,
      })),
    })
  } catch (error) {
    console.error("Failed to load Delta orders:", error)
    return NextResponse.json({ error: "Unable to load recent Delta orders" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    if (environment === "live") await assertLiveTradingEnabled(session.sub)

    const body = await request.json().catch(() => null)
    const parsed = orderSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid order payload" }, { status: 400 })
    }

    const symbol = normalizeSymbol(parsed.data.symbol)
    const maxSize = getDeltaOrderMaxSize(environment)
    if (parsed.data.size > maxSize) {
      return NextResponse.json(
        { error: `Market order size cannot exceed ${maxSize} contract(s) per account` },
        { status: 400 },
      )
    }

    await connectDB()
    const ticker = await getDeltaTickerPrice(symbol, environment).catch(() => null)

    const accountIds = parsed.data.accountIds ?? (parsed.data.accountId ? [parsed.data.accountId] : [])
    const isBroadcast = accountIds.length > 1 || (parsed.data.accountIds?.length ?? 0) > 0

    if (isBroadcast) {
      const user = await User.findById(session.sub).select("deltaAutoTradePreferences").lean()
      const config = getDeltaAutoTradeConfig(user?.deltaAutoTradePreferences, environment)
      const { eligible, ineligible } = await resolveManualBroadcastAccounts({
        userId: session.sub,
        environment,
        accountIds,
        symbol,
        lots: parsed.data.size,
        config,
        markPrice: ticker?.price,
      })

      const preSkipped = ineligible.map(ineligibleToAccountResult)
      const targetIds = eligible.map((a) => a.accountId)

      if (targetIds.length === 0) {
        const orderId = `${Date.now()}`
        await persistDeltaTradeNotifications(session.sub, environment, {
          source: "manual",
          symbol,
          side: parsed.data.side,
          lots: parsed.data.size,
          status: "failed",
          accountResults: preSkipped,
          error: "No accounts with sufficient margin",
          orderId,
        })
        return NextResponse.json({
          results: preSkipped,
          okCount: 0,
          total: preSkipped.length,
          skippedCount: preSkipped.length,
        })
      }

      const { results: placedResults } = await placeDeltaMarketOrderBatch({
        userId: session.sub,
        environment,
        accountIds: targetIds,
        symbol,
        side: parsed.data.side,
        qty: parsed.data.size,
        price: ticker?.price,
      })

      const results = [...preSkipped, ...placedResults]
      const okCount = results.filter((r) => r.ok).length
      const status = okCount === 0 ? "failed" : okCount === results.length ? "success" : "partial"
      const orderId = `${Date.now()}`

      if (status !== "success") {
        await persistDeltaTradeNotifications(session.sub, environment, {
          source: "manual",
          symbol,
          side: parsed.data.side,
          lots: parsed.data.size,
          status,
          accountResults: results.map((r) => ({
            accountId: r.accountId,
            label: r.label,
            ok: r.ok,
            brokerOrderId: r.brokerOrderId,
            error: r.error,
          })),
          orderId,
        })
      }

      return NextResponse.json({
        results,
        okCount,
        total: results.length,
        skippedCount: preSkipped.length,
      })
    }

    let accountId = parsed.data.accountId
    if (!accountId) {
      if (hasEnvDeltaCredentials(environment)) {
        accountId = "env"
      } else {
        const defaultAccount = await getDefaultDeltaAccount(session.sub, environment)
        if (!defaultAccount) {
          return NextResponse.json({ error: "No Delta accounts configured" }, { status: 400 })
        }
        accountId = defaultAccount._id.toString()
      }
    }

    const placed = await placeDeltaMarketOrderForAccount({
      userId: session.sub,
      accountId,
      environment,
      symbol,
      side: parsed.data.side,
      qty: parsed.data.size,
      price: ticker?.price,
    })

    if (!placed.ok) {
      return NextResponse.json({ error: "No Delta API credentials configured" }, { status: 400 })
    }

    return NextResponse.json({
      accountId: placed.accountId,
      accountLabel: placed.accountLabel,
      brokerOrderId: placed.brokerOrderId,
      symbol: placed.symbol,
      side: placed.side,
      size: placed.size,
      price: placed.price,
      productId: placed.productId,
    })
  } catch (error) {
    console.error("Delta order failed:", error)
    const message = error instanceof Error ? error.message : "Delta order failed"
    const status = message.includes("Live trading is disabled") ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
