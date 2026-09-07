import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaProduct, setProductLeverage } from "@/lib/broker/delta-exchange"
import {
  getDefaultDeltaAccount,
  getDeltaCredentialsByAccountId,
  hasEnvDeltaCredentials,
  listEnabledDeltaAccounts,
} from "@/lib/broker/delta-credentials"
import { assertLiveTradingEnabled } from "@/lib/broker/delta-live-guard"
import { DELTA_LEVERAGE_STEPS, normalizeDeltaProduct } from "@/lib/broker/delta-product"
import { getSession } from "@/lib/session"

const leverageSchema = z.object({
  symbol: z.string().min(1).max(32),
  leverage: z.number().int().positive(),
  accountId: z.string().optional(),
  accountIds: z.array(z.string()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    if (environment === "live") await assertLiveTradingEnabled(session.sub)

    const body = await request.json().catch(() => null)
    const parsed = leverageSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid leverage payload" }, { status: 400 })
    }

    if (!DELTA_LEVERAGE_STEPS.includes(parsed.data.leverage as (typeof DELTA_LEVERAGE_STEPS)[number])) {
      return NextResponse.json({ error: "Unsupported leverage value" }, { status: 400 })
    }

    const symbol = parsed.data.symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
    const productRaw = await getDeltaProduct(symbol, environment)
    const product = normalizeDeltaProduct(productRaw)
    if (!product) {
      return NextResponse.json({ error: `Product not found: ${symbol}` }, { status: 404 })
    }

    await connectDB()

    const targetIds = parsed.data.accountIds?.length
      ? [...new Set(parsed.data.accountIds)]
      : parsed.data.accountId
        ? [parsed.data.accountId]
        : []

    let accountIds = targetIds
    if (accountIds.length === 0) {
      if (hasEnvDeltaCredentials(environment)) accountIds = ["env"]
      else {
        const defaultAccount = await getDefaultDeltaAccount(session.sub, environment)
        if (!defaultAccount) {
          return NextResponse.json({ error: "No Delta accounts configured" }, { status: 400 })
        }
        accountIds = [defaultAccount._id.toString()]
      }
    }

    const enabled = await listEnabledDeltaAccounts(session.sub, environment)
    const enabledIds = new Set(enabled.map((a) => a.id))

    const results: {
      accountId: string
      label: string
      ok: boolean
      error?: string
    }[] = []

    const settled = await Promise.allSettled(
      accountIds.map(async (id) => {
        if (id !== "env" && !enabledIds.has(id)) {
          return { accountId: id, label: id, ok: false as const, error: "Account not enabled" }
        }
        const resolved = await getDeltaCredentialsByAccountId(session.sub, id, environment)
        if (!resolved) {
          return { accountId: id, label: id, ok: false as const, error: "Account not found" }
        }
        try {
          await setProductLeverage(resolved.creds, environment, product.productId, parsed.data.leverage)
          return { accountId: resolved.account.id, label: resolved.account.label, ok: true as const }
        } catch (error) {
          return {
            accountId: resolved.account.id,
            label: resolved.account.label,
            ok: false as const,
            error: error instanceof Error ? error.message : "Failed to set leverage",
          }
        }
      }),
    )

    for (const entry of settled) {
      if (entry.status === "fulfilled") {
        results.push(entry.value)
      } else {
        results.push({
          accountId: "unknown",
          label: "unknown",
          ok: false,
          error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
        })
      }
    }

    const okCount = results.filter((r) => r.ok).length
    if (okCount === 0) {
      return NextResponse.json(
        {
          error: results[0]?.error || "Failed to set leverage on all accounts",
          results,
          okCount: 0,
          total: results.length,
        },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      leverage: parsed.data.leverage,
      symbol,
      results,
      okCount,
      total: results.length,
      accountId: results.find((r) => r.ok)?.accountId,
      label: results.find((r) => r.ok)?.label,
    })
  } catch (error) {
    console.error("Failed to set Delta leverage:", error)
    const message = error instanceof Error ? error.message : "Unable to set leverage"
    const status = message.includes("Live trading is disabled") ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
