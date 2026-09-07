import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getPositions } from "@/lib/broker/delta-exchange"
import {
  getDeltaCredentialsByAccountId,
  hasEnvDeltaCredentials,
  listEnabledDeltaAccounts,
} from "@/lib/broker/delta-credentials"
import { normalizeDeltaPositions } from "@/lib/broker/delta-positions"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const accountIdFilter = request.nextUrl.searchParams.get("accountId")

    if (hasEnvDeltaCredentials(environment)) {
      const resolved = await getDeltaCredentialsByAccountId(session.sub, "env", environment)
      if (!resolved) {
        return NextResponse.json({ error: "No Delta API credentials configured" }, { status: 400 })
      }
      const response = await getPositions(resolved.creds, environment)
      const positions = normalizeDeltaPositions(response.result).map((p) => ({
        ...p,
        accountId: "env",
        accountLabel: resolved.account.label,
      }))
      return NextResponse.json({
        positions,
        accounts: [{ accountId: "env", label: resolved.account.label, positions }],
      })
    }

    const accounts = await listEnabledDeltaAccounts(session.sub, environment)
    if (accounts.length === 0) {
      return NextResponse.json({ error: "No Delta accounts configured" }, { status: 400 })
    }

    const targets = accountIdFilter ? accounts.filter((a) => a.id === accountIdFilter) : accounts

    const settled = await Promise.allSettled(
      targets.map(async (account) => {
        const resolved = await getDeltaCredentialsByAccountId(session.sub, account.id, environment)
        if (!resolved) throw new Error("missing credentials")
        const response = await getPositions(resolved.creds, environment)
        const positions = normalizeDeltaPositions(response.result).map((p) => ({
          ...p,
          accountId: account.id,
          accountLabel: account.label,
        }))
        return { accountId: account.id, label: account.label, positions }
      }),
    )

    const accountBlocks: Array<{ accountId: string; label: string; positions: unknown[]; error?: string }> = []
    const positions: Array<Record<string, unknown>> = []

    settled.forEach((entry, index) => {
      const account = targets[index]
      if (!account) return
      if (entry.status === "fulfilled") {
        accountBlocks.push(entry.value)
        positions.push(...entry.value.positions)
      } else {
        accountBlocks.push({
          accountId: account.id,
          label: account.label,
          positions: [],
          error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason),
        })
      }
    })

    return NextResponse.json({ positions, accounts: accountBlocks })
  } catch (error) {
    console.error("Failed to load Delta positions:", error)
    const message = error instanceof Error ? error.message : "Unable to load Delta positions"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
