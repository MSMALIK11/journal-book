import { NextRequest, NextResponse } from "next/server"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { getAlertsForAccount } from "@/lib/trading/alerts-server"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { accountId } = await getAccountContext(request, session.sub)
    const limit = Number(request.nextUrl.searchParams.get("limit") || 50)

    const data = await getAlertsForAccount(session.sub, accountId, {
      limit: Number.isFinite(limit) ? limit : 50,
    })

    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Failed to load alerts:", error)
    return NextResponse.json({ error: "Unable to load alerts" }, { status: 500 })
  }
}
