import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { closeDeltaPosition } from "@/lib/broker/delta-close"
import { getDeltaCredentialsByAccountId, listDeltaAccounts } from "@/lib/broker/delta-credentials"
import { assertLiveTradingEnabled } from "@/lib/broker/delta-live-guard"
import { getSession } from "@/lib/session"

const closeSchema = z.object({
  accountId: z.string().optional(),
  accountIds: z.array(z.string()).optional(),
  symbol: z.string().min(1).max(32),
  side: z.enum(["long", "short"]),
  size: z.number().int().positive().optional(),
})

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/[^A-Za-z0-9_-]/g, "").toUpperCase()
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    if (environment === "live") await assertLiveTradingEnabled(session.sub)

    const body = await request.json().catch(() => null)
    const parsed = closeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid close payload" }, { status: 400 })
    }

    await connectDB()
    const accountIds = parsed.data.accountIds ?? (parsed.data.accountId ? [parsed.data.accountId] : [])
    if (accountIds.length === 0) {
      return NextResponse.json({ error: "accountId or accountIds required" }, { status: 400 })
    }

    const symbol = normalizeSymbol(parsed.data.symbol)
    const size = parsed.data.size
    if (!size) {
      return NextResponse.json({ error: "size is required to close a position" }, { status: 400 })
    }

    const accounts = await listDeltaAccounts(session.sub, environment)
    const labelById = new Map(accounts.map((a) => [a.id, a.label]))
    labelById.set("env", environment === "live" ? "Env override (live)" : "Env override")

    const settled = await Promise.allSettled(
      accountIds.map(async (accountId) => {
        const resolved = await getDeltaCredentialsByAccountId(session.sub, accountId, environment)
        if (!resolved) throw new Error("Account not found")
        await closeDeltaPosition(resolved.creds, environment, {
          symbol,
          side: parsed.data.side,
          size,
        })
        return { accountId, label: resolved.account.label }
      }),
    )

    const results = settled.map((entry, index) => {
      const accountId = accountIds[index] ?? "unknown"
      const label = labelById.get(accountId) ?? accountId
      if (entry.status === "fulfilled") {
        return { accountId, label, ok: true as const, symbol, size }
      }
      return {
        accountId,
        label,
        ok: false as const,
        error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
      }
    })

    const okCount = results.filter((r) => r.ok).length
    return NextResponse.json({ results, okCount, total: results.length })
  } catch (error) {
    console.error("Failed to close Delta position:", error)
    const message = error instanceof Error ? error.message : "Unable to close position"
    const status = message.includes("Live trading is disabled") ? 403 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
