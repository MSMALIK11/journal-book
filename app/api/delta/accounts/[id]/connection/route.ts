import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaBaseUrl, testDeltaConnection } from "@/lib/broker/delta-exchange"
import { getDeltaCredentialsByAccountId } from "@/lib/broker/delta-credentials"
import { getSession } from "@/lib/session"

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const { id } = await context.params
    await connectDB()
    const resolved = await getDeltaCredentialsByAccountId(session.sub, id, environment)
    if (!resolved) {
      return NextResponse.json({ error: "Account not found or not configured" }, { status: 404 })
    }

    const result = await testDeltaConnection(resolved.creds, environment)
    const envLabel = environment === "live" ? "Delta live" : "Delta demo"
    return NextResponse.json({
      ok: true,
      accountId: resolved.account.id,
      label: resolved.account.label,
      environment,
      message: `Connected ${resolved.account.label} to ${envLabel} (${getDeltaBaseUrl(environment)}). Open positions: ${result.positionCount}.`,
      positionCount: result.positionCount,
    })
  } catch (error) {
    console.error("Delta account connection test failed:", error)
    const message = error instanceof Error ? error.message : "Connection test failed"
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
