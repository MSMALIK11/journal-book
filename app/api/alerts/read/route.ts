import { NextRequest, NextResponse } from "next/server"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { markAlertsRead } from "@/lib/trading/alerts-server"

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

    await markAlertsRead(session.sub, accountId, {
      ids: Array.isArray(body.ids) ? body.ids.map(String) : undefined,
      all: Boolean(body.all),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to mark alerts read:", error)
    return NextResponse.json({ error: "Unable to update alerts" }, { status: 500 })
  }
}
