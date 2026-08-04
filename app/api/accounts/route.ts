import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import TradingAccount from "@/app/api/models/TradingAccount"
import { getAccountContext, ACTIVE_ACCOUNT_COOKIE, activeAccountCookieOptions } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import {
  ensureDefaultTradingAccount,
  formatAccount,
  getAccountTradeCounts,
  getUserAccounts,
  normalizeAccountSymbols,
  reconcileTradeAccounts,
} from "@/lib/trading-accounts-server"
import { createAccountSchema } from "@/lib/validations/trading-account"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const accounts = await getUserAccounts(session.sub)
    const { accountId } = await getAccountContext(request, session.sub)
    const tradeCounts = await getAccountTradeCounts(session.sub)

    return NextResponse.json({
      accounts: accounts.map((account) =>
        formatAccount({
          ...account,
          tradeCount: tradeCounts[String(account._id)] ?? 0,
        }),
      ),
      activeAccountId: accountId,
    })
  } catch (error) {
    console.error("Failed to load accounts:", error)
    return NextResponse.json({ error: "Unable to load accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = createAccountSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid account data" },
        { status: 400 },
      )
    }

    await connectDB()
    await ensureDefaultTradingAccount(session.sub)

    const account = await TradingAccount.create({
      userId: session.sub,
      name: parsed.data.name,
      symbols: await normalizeAccountSymbols(
        parsed.data.symbols.length
          ? parsed.data.symbols
          : [parsed.data.name],
      ),
      color: parsed.data.color,
      isDefault: false,
    })

    const { moved } = await reconcileTradeAccounts(session.sub)

    return NextResponse.json(
      { account: formatAccount(account.toObject()), tradesReassigned: moved },
      { status: 201 },
    )
  } catch (error) {
    console.error("Failed to create account:", error)
    return NextResponse.json({ error: "Unable to create account" }, { status: 500 })
  }
}
