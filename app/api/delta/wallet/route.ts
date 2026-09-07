import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getWalletBalances } from "@/lib/broker/delta-exchange"
import { getDeltaCredentialsByAccountId } from "@/lib/broker/delta-credentials"
import { normalizeDeltaWallet } from "@/lib/broker/delta-wallet"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const accountId = request.nextUrl.searchParams.get("accountId")
    if (!accountId) {
      return NextResponse.json({ error: "accountId query parameter is required" }, { status: 400 })
    }

    await connectDB()
    const resolved = await getDeltaCredentialsByAccountId(session.sub, accountId, environment)
    if (!resolved) {
      return NextResponse.json({ error: "Account not found or not configured" }, { status: 404 })
    }

    const response = await getWalletBalances(resolved.creds, environment)
    const wallet = normalizeDeltaWallet(response)
    if (!wallet) {
      return NextResponse.json({ error: "Unable to read wallet balances" }, { status: 400 })
    }

    return NextResponse.json({
      accountId: resolved.account.id,
      label: resolved.account.label,
      wallet,
    })
  } catch (error) {
    console.error("Failed to load Delta wallet:", error)
    const message = error instanceof Error ? error.message : "Unable to load wallet"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
