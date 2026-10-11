import { NextRequest, NextResponse } from "next/server"
import TradingAccount from "@/app/api/models/TradingAccount"
import connectDB from "@/app/api/db/mongoose"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { markAlertsRead } from "@/lib/trading/alerts-server"

async function resolveAccountId(
  request: NextRequest,
  userId: string,
  requestedAccountId?: string,
) {
  const { accountId: contextAccountId } = await getAccountContext(request, userId)
  if (!requestedAccountId || requestedAccountId === contextAccountId) {
    return contextAccountId
  }

  await connectDB()
  const account = await TradingAccount.findOne({ _id: requestedAccountId, userId })
    .select("_id")
    .lean()
  if (!account) return contextAccountId
  return String(account._id)
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const accountId = await resolveAccountId(
      request,
      session.sub,
      typeof body.accountId === "string" ? body.accountId : undefined,
    )

    await markAlertsRead(session.sub, accountId, {
      ids: Array.isArray(body.ids) ? body.ids.map(String) : undefined,
      keys: Array.isArray(body.keys) ? body.keys.map(String) : undefined,
      all: Boolean(body.all),
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to mark alerts read:", error)
    return NextResponse.json({ error: "Unable to update alerts" }, { status: 500 })
  }
}
