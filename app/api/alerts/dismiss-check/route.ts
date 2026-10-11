import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import TradingAlert from "@/app/api/models/TradingAlert"
import TradingAccount from "@/app/api/models/TradingAccount"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"

/** Lightweight poll: were any of these alert keys dismissed on another device? */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const accountParam = request.nextUrl.searchParams.get("account")
    const { accountId: contextAccountId } = await getAccountContext(request, session.sub)
    let accountId = contextAccountId
    if (accountParam && accountParam !== contextAccountId) {
      await connectDB()
      const account = await TradingAccount.findOne({ _id: accountParam, userId: session.sub })
        .select("_id")
        .lean()
      if (account) accountId = String(account._id)
    }
    const keysParam = request.nextUrl.searchParams.get("keys") || ""
    const keys = [...new Set(keysParam.split(",").map((key) => key.trim()).filter(Boolean))]
    if (!keys.length) {
      return NextResponse.json({ dismissedKeys: [] }, { headers: { "Cache-Control": "no-store" } })
    }

    await connectDB()
    const read = await TradingAlert.find({
      userId: session.sub,
      accountId,
      key: { $in: keys },
      read: true,
    })
      .select("key")
      .lean()

    const dismissedKeys = read.map((row) => String(row.key))
    return NextResponse.json(
      { dismissedKeys, dismissed: dismissedKeys.length > 0 },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to check alert dismiss status:", error)
    return NextResponse.json({ error: "Unable to check dismiss status" }, { status: 500 })
  }
}
