import "server-only"

import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import TradingAccount from "@/app/api/models/TradingAccount"
import {
  normalizeSymbolList,
  resolveAccountForInstrument,
  normalizeSymbol,
  canonicalInstrumentSymbol,
  accountNameForInstrument,
  findAccountForInstrument,
} from "@/lib/trading/account-match"

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

/** Use existing symbol account, or create one (never leaves synced symbol on Main). */
export async function resolveOrCreateAccountForInstrument(
  userId: string,
  instrument: string,
  accounts: Awaited<ReturnType<typeof getUserAccounts>>,
) {
  const existing = findAccountForInstrument(accounts, instrument)
  if (existing) {
    return { account: existing, created: false as const, accounts }
  }

  const normalized = canonicalInstrumentSymbol(instrument)
  if (!normalized) {
    const fallback = accounts.find((a) => a.isDefault) ?? accounts[0]
    return { account: fallback, created: false as const, accounts }
  }

  const name = accountNameForInstrument(instrument)
  const canonical = canonicalInstrumentSymbol(instrument)
  const byName = accounts.find(
    (account) =>
      !account.isDefault &&
      (normalizeSymbol(account.name) === normalizeSymbol(name) ||
        normalizeSymbol(account.name) === normalizeSymbol(canonical)),
  )

  if (byName) {
    const symbols = normalizeSymbolList([...(byName.symbols || []), canonical])
    if (symbols.length !== (byName.symbols || []).length) {
      await TradingAccount.updateOne({ _id: byName._id }, { $set: { symbols } })
      byName.symbols = symbols
    }
    return { account: byName, created: false as const, accounts }
  }

  const account = await TradingAccount.create({
    userId,
    name,
    symbols: normalizeSymbolList([canonical]),
    isDefault: false,
  })
  const accountObj = account.toObject()
  return {
    account: accountObj,
    created: true as const,
    accounts: [...accounts, accountObj],
  }
}

/** Auto-create a portfolio per synced symbol (e.g. XAUUSD → Gold account). */
export async function ensureAccountsForInstruments(userId: string, instruments: string[]) {
  await connectDB()
  await ensureDefaultTradingAccount(userId)

  let accounts = await TradingAccount.find({ userId }).sort({ isDefault: -1, name: 1 }).lean()
  const created: string[] = []
  const unique = [
    ...new Set(instruments.map((instrument) => canonicalInstrumentSymbol(instrument)).filter(Boolean)),
  ]

  for (const instrument of unique) {
    const result = await resolveOrCreateAccountForInstrument(userId, instrument, accounts)
    accounts = result.accounts
    if (result.created) created.push(result.account.name)
  }

  return { created, accounts }
}

/** Create missing symbol accounts for trades already in the database. */
export async function ensureAccountsFromExistingTrades(userId: string) {
  const instruments = await Trade.distinct("instrument", { userId })
  if (!instruments.length) return { created: [] as string[] }
  const result = await ensureAccountsForInstruments(userId, instruments)
  if (result.created.length) {
    await reconcileTradeAccounts(userId)
  }
  return result
}

/** Move trades to the account their instrument matches (e.g. BTCUSDT → BTC account). */
export async function reconcileTradeAccounts(userId: string) {
  await connectDB()
  let accounts = await TradingAccount.find({ userId }).lean()
  if (!accounts.length) return { moved: 0, accountIds: [] as string[] }

  const trades = await Trade.find({ userId })
  let moved = 0
  const accountIds = new Set<string>()

  for (const trade of trades) {
    const resolved = await resolveOrCreateAccountForInstrument(
      userId,
      canonicalInstrumentSymbol(trade.instrument),
      accounts,
    )
    accounts = resolved.accounts
    const target = resolved.account
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
