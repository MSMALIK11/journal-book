import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaBaseUrl } from "@/lib/broker/delta-exchange"
import {
  hasEnvDeltaCredentials,
  listDeltaAccounts,
} from "@/lib/broker/delta-credentials"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import { isServerLiveTradingBlocked } from "@/lib/broker/delta-live-guard"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const accounts = await listDeltaAccounts(session.sub, environment)

    return NextResponse.json({
      accounts,
      environment,
      configured: hasEnvDeltaCredentials(environment) || accounts.length > 0,
      envOverride: hasEnvDeltaCredentials(environment),
      serverLiveBlocked: isServerLiveTradingBlocked(),
      baseUrl: getDeltaBaseUrl(environment),
      maxOrderSize: getDeltaOrderMaxSize(environment),
    })
  } catch (error) {
    console.error("Failed to load Delta credentials:", error)
    return NextResponse.json({ error: "Unable to load Delta credentials" }, { status: 500 })
  }
}
