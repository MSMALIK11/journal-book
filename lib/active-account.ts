import "server-only"

import type { NextRequest } from "next/server"
import TradingAccount from "@/app/api/models/TradingAccount"
import connectDB from "@/app/api/db/mongoose"
import { ensureDefaultTradingAccount } from "@/lib/trading-accounts-server"
import { sessionCookieOptions } from "@/lib/session"

export const ACTIVE_ACCOUNT_COOKIE = "active_account_id"

export const activeAccountCookieOptions = {
  ...sessionCookieOptions,
}

export async function getAccountContext(request: NextRequest, userId: string) {
  await connectDB()
  await ensureDefaultTradingAccount(userId)

  const cookieId = request.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value
  let account = cookieId
    ? await TradingAccount.findOne({ _id: cookieId, userId }).lean()
    : null

  if (!account) {
    account = await TradingAccount.findOne({ userId, isDefault: true }).lean()
  }
  if (!account) {
    account = await TradingAccount.findOne({ userId }).lean()
  }
  if (!account) {
    const created = await ensureDefaultTradingAccount(userId)
    account = created.toObject()
  }

  return {
    accountId: String(account._id),
    account,
  }
}
