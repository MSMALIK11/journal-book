import "server-only"

import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import TradingAccount from "@/app/api/models/TradingAccount"
import { normalizeSymbolList, resolveAccountForInstrument } from "@/lib/trading/account-match"

export async function createDefaultTradingAccount(userId: string) {
  await connectDB()
  const account = await TradingAccount.create({
    userId,
    name: "Main",
    symbols: [],
    isDefault: true,
  })
  return account
}

export async function ensureDefaultTradingAccount(userId: string) {
  await connectDB()
  let account = await TradingAccount.findOne({ userId, isDefault: true })
  if (!account) {
    account = await TradingAccount.findOne({ userId })
  }
  if (!account) {
    account = await createDefaultTradingAccount(userId)
  } else if (!account.isDefault) {
    const hasDefault = await TradingAccount.exists({ userId, isDefault: true })
    if (!hasDefault) {
      account.isDefault = true
      await account.save()
    }
  }

  await migrateUserTradesToDefaultAccount(userId, String(account._id))
  return account
}

export async function getUserAccounts(userId: string) {
  await connectDB()
  await ensureDefaultTradingAccount(userId)
  return TradingAccount.find({ userId }).sort({ isDefault: -1, name: 1 }).lean()
}

export async function getDefaultAccountId(userId: string): Promise<string> {
  const account = await ensureDefaultTradingAccount(userId)
  return String(account._id)
}

export async function migrateUserTradesToDefaultAccount(userId: string, accountId: string) {
  await Trade.updateMany(
    { userId, $or: [{ accountId: { $exists: false } }, { accountId: null }, { accountId: "" }] },
    { $set: { accountId } },
  )
}

export function formatAccount(account: {
  _id: unknown
  userId: string
  name: string
  symbols: string[]
  isDefault: boolean
  color?: string
  createdAt?: Date
  updatedAt?: Date
  tradeCount?: number
}) {
  return {
    id: String(account._id),
    userId: account.userId,
    name: account.name,
    symbols: account.symbols,
    isDefault: account.isDefault,
    color: account.color,
    tradeCount: account.tradeCount ?? 0,
    createdAt: account.createdAt?.toISOString(),
    updatedAt: account.updatedAt?.toISOString(),
  }
}

export async function normalizeAccountSymbols(symbols: string[]) {
  return normalizeSymbolList(symbols)
}

/** Move trades to the account their instrument matches (e.g. BTCUSDT → BTC account). */
export async function reconcileTradeAccounts(userId: string) {
  await connectDB()
  const accounts = await TradingAccount.find({ userId }).lean()
  if (!accounts.length) return { moved: 0, accountIds: [] as string[] }

  const trades = await Trade.find({ userId })
  let moved = 0
  const accountIds = new Set<string>()

  for (const trade of trades) {
    const target = resolveAccountForInstrument(accounts, trade.instrument)
    const targetId = String(target._id)
    if (trade.accountId === targetId) continue

    if (trade.external_id) {
      const conflict = await Trade.findOne({
        accountId: targetId,
        external_id: trade.external_id,
        _id: { $ne: trade._id },
      })
      if (conflict) {
        await Trade.deleteOne({ _id: trade._id })
        accountIds.add(targetId)
        moved += 1
        continue
      }
    }

    await Trade.updateOne({ _id: trade._id }, { $set: { accountId: targetId } })
    accountIds.add(targetId)
    moved += 1
  }

  return { moved, accountIds: [...accountIds] }
}

export async function getAccountTradeCounts(userId: string) {
  await connectDB()
  const counts = await Trade.aggregate([
    { $match: { userId } },
    { $group: { _id: "$accountId", count: { $sum: 1 } } },
  ])
  return Object.fromEntries(counts.map((row) => [String(row._id), row.count as number]))
}
