import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import TradingAccount from "@/app/api/models/TradingAccount"
import { ACTIVE_ACCOUNT_COOKIE, activeAccountCookieOptions, getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { formatAccount, normalizeAccountSymbols, reconcileTradeAccounts } from "@/lib/trading-accounts-server"
import { updateAccountSchema } from "@/lib/validations/trading-account"

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    const parsed = updateAccountSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid account data" },
        { status: 400 },
      )
    }

    await connectDB()

    const account = await TradingAccount.findOne({ _id: id, userId: session.sub })
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const symbolsChanged = parsed.data.symbols !== undefined

    if (parsed.data.name !== undefined) account.name = parsed.data.name
    if (symbolsChanged) {
      account.symbols = await normalizeAccountSymbols(parsed.data.symbols)
    }
    if (parsed.data.color !== undefined) account.color = parsed.data.color

    if (parsed.data.isDefault === true && !account.isDefault) {
      await TradingAccount.updateMany({ userId: session.sub }, { $set: { isDefault: false } })
      account.isDefault = true
    }

    await account.save()

    const { moved } = symbolsChanged ? await reconcileTradeAccounts(session.sub) : { moved: 0 }

    return NextResponse.json({
      account: formatAccount(account.toObject()),
      tradesReassigned: moved,
    })
  } catch (error) {
    console.error("Failed to update account:", error)
    return NextResponse.json({ error: "Unable to update account" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await context.params
    await connectDB()

    const accountCount = await TradingAccount.countDocuments({ userId: session.sub })
    if (accountCount <= 1) {
      return NextResponse.json({ error: "Cannot delete your only account" }, { status: 400 })
    }

    const account = await TradingAccount.findOne({ _id: id, userId: session.sub })
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const wasDefault = account.isDefault
    await Trade.deleteMany({ userId: session.sub, accountId: id })
    await account.deleteOne()

    if (wasDefault) {
      const next = await TradingAccount.findOne({ userId: session.sub }).sort({ createdAt: 1 })
      if (next) {
        next.isDefault = true
        await next.save()
      }
    }

    const { accountId } = await getAccountContext(request, session.sub)
    const response = NextResponse.json({ success: true, activeAccountId: accountId })
    if (request.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value === id) {
      response.cookies.set(ACTIVE_ACCOUNT_COOKIE, accountId, activeAccountCookieOptions)
    }

    return response
  } catch (error) {
    console.error("Failed to delete account:", error)
    return NextResponse.json({ error: "Unable to delete account" }, { status: 500 })
  }
}
