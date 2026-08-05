import { NextRequest, NextResponse } from "next/server"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import {
  digestExistsForToday,
  evaluateAndPersistAlerts,
  loadAccountAlertContext,
} from "@/lib/trading/alerts-server"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { accountId } = await getAccountContext(request, session.sub)
    const body = await request.json().catch(() => ({}))
    const includeDigest = Boolean(body.includeDigest)

    let shouldIncludeDigest = includeDigest
    if (includeDigest) {
      const { timezone } = await loadAccountAlertContext(session.sub, accountId)
      const exists = await digestExistsForToday(session.sub, accountId, timezone)
      shouldIncludeDigest = !exists
    }

    const result = await evaluateAndPersistAlerts(session.sub, accountId, {
      includeDigest: shouldIncludeDigest,
    })

    return NextResponse.json({
      created: result.persisted.length,
      alerts: result.persisted,
    })
  } catch (error) {
    console.error("Failed to evaluate alerts:", error)
    return NextResponse.json({ error: "Unable to evaluate alerts" }, { status: 500 })
  }
}
