import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import {
  fetchAccountAvailableMargin,
  formatIneligibleReason,
} from "@/lib/broker/delta-broadcast-sizing"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const rawIds = request.nextUrl.searchParams.get("accountIds")?.trim()
    if (!rawIds) {
      return NextResponse.json({ error: "accountIds query parameter is required" }, { status: 400 })
    }

    const accountIds = [...new Set(rawIds.split(",").map((id) => id.trim()).filter(Boolean))]
    if (accountIds.length === 0) {
      return NextResponse.json({ error: "At least one accountId is required" }, { status: 400 })
    }

    await connectDB()

    const settled = await Promise.allSettled(
      accountIds.map(async (accountId) => {
        const result = await fetchAccountAvailableMargin({
          userId: session.sub,
          accountId,
          environment,
        })
        return { accountId, result }
      }),
    )

    const wallets: Record<
      string,
      { label: string; marginUsd: number; balanceUsd?: number } | { label: string; error: string }
    > = {}

    for (let i = 0; i < settled.length; i++) {
      const entry = settled[i]
      const accountId = accountIds[i] ?? "unknown"
      if (entry.status === "fulfilled") {
        const { result } = entry.value
        if (result.ok) {
          wallets[accountId] = {
            label: result.label,
            marginUsd: result.marginUsd,
            balanceUsd: result.balanceUsd,
          }
        } else {
          wallets[accountId] = {
            label: result.label,
            error: formatIneligibleReason(result.reason),
          }
        }
        continue
      }
      wallets[accountId] = {
        label: accountId,
        error: entry.reason instanceof Error ? entry.reason.message : "Failed to load wallet",
      }
    }

    return NextResponse.json({ wallets })
  } catch (error) {
    console.error("Failed to load Delta wallets:", error)
    const message = error instanceof Error ? error.message : "Unable to load wallets"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
