import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaBaseUrl, testDeltaConnection } from "@/lib/broker/delta-exchange"
import { getDeltaCredentialsForUser } from "@/lib/broker/delta-credentials"
import { getSession } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const creds = await getDeltaCredentialsForUser(session.sub, environment)
    if (!creds) {
      return NextResponse.json(
        { ok: false, error: "No Delta API credentials configured" },
        { status: 400 },
      )
    }

    const result = await testDeltaConnection(creds, environment)
    const envLabel = environment === "live" ? "Delta live" : "Delta demo"
    return NextResponse.json({
      ok: true,
      environment,
      message: `Connected to ${envLabel} (${getDeltaBaseUrl(environment)}). Open positions: ${result.positionCount}.`,
      positionCount: result.positionCount,
    })
  } catch (error) {
    console.error("Delta connection test failed:", error)
    const message = error instanceof Error ? error.message : "Delta connection test failed"
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
