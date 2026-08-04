import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import TradingAccount from "@/app/api/models/TradingAccount"
import { ACTIVE_ACCOUNT_COOKIE, activeAccountCookieOptions } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { formatAccount } from "@/lib/trading-accounts-server"
import { z } from "zod"

const switchSchema = z.object({
  accountId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = switchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account id" }, { status: 400 })
    }

    await connectDB()

    const account = await TradingAccount.findOne({
      _id: parsed.data.accountId,
      userId: session.sub,
    }).lean()

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const response = NextResponse.json({
      account: formatAccount(account),
      activeAccountId: String(account._id),
    })
    response.cookies.set(ACTIVE_ACCOUNT_COOKIE, String(account._id), activeAccountCookieOptions)
    return response
  } catch (error) {
    console.error("Failed to switch account:", error)
    return NextResponse.json({ error: "Unable to switch account" }, { status: 500 })
  }
}
