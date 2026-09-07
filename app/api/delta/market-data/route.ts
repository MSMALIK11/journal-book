import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaProduct, getDeltaTickerPrice, getPositions } from "@/lib/broker/delta-exchange"
import { getDeltaCredentialsByAccountId, getDeltaCredentialsForUser } from "@/lib/broker/delta-credentials"
import { normalizeDeltaProduct } from "@/lib/broker/delta-product"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import { getDeltaAutoTradeConfig, getLeverageForSymbol } from "@/lib/delta/auto-trade-settings"
import User from "@/app/api/models/User"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const environment = getDeltaEnvironmentFromRequest(request)
    const symbol = (request.nextUrl.searchParams.get("symbol") ?? "BTCUSD")
      .replace(/[^A-Za-z0-9_-]/g, "")
      .toUpperCase()

    const [productRaw, ticker] = await Promise.all([
      getDeltaProduct(symbol, environment),
      getDeltaTickerPrice(symbol, environment).catch(() => null),
    ])

    if (!productRaw) {
      return NextResponse.json({ error: `Product not found: ${symbol}` }, { status: 404 })
    }

    const product = normalizeDeltaProduct(productRaw, ticker?.price)
    if (!product) {
      return NextResponse.json({ error: "Unable to parse product data" }, { status: 500 })
    }

    let leverage = product.defaultLeverage
    const session = await getSession(request)
    const accountId = request.nextUrl.searchParams.get("accountId")
    if (session) {
      await connectDB()
      const user = await User.findById(session.sub).select("deltaAutoTradePreferences").lean()
      const config = getDeltaAutoTradeConfig(user?.deltaAutoTradePreferences, environment)
      leverage = getLeverageForSymbol(config, symbol, product.defaultLeverage)

      const creds = accountId
        ? (await getDeltaCredentialsByAccountId(session.sub, accountId, environment))?.creds
        : await getDeltaCredentialsForUser(session.sub, environment)
      if (creds) {
        try {
          const positions = await getPositions(creds, environment)
          const match = Array.isArray(positions.result)
            ? positions.result.find((p) => {
                if (!p || typeof p !== "object") return false
                const row = p as Record<string, unknown>
                return String(row.product_symbol ?? row.symbol ?? "").toUpperCase() === symbol
              })
            : null
          if (match && typeof match === "object" && "leverage" in match) {
            const lv = Number((match as { leverage?: unknown }).leverage)
            if (Number.isFinite(lv) && lv > 0) leverage = lv
          }
        } catch {
          /* use saved or default leverage */
        }
      }
    }

    return NextResponse.json({
      product: { ...product, leverage },
      markPrice: ticker?.price ?? product.markPrice,
      maxOrderSize: getDeltaOrderMaxSize(environment),
    })
  } catch (error) {
    console.error("Failed to load Delta market data:", error)
    const message = error instanceof Error ? error.message : "Unable to load market data"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
