import "server-only"

import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"
import { isOpenSyncedTrade } from "@/lib/trading/tradingview-open"
import { normalizeTradingViewDatetime } from "@/lib/validations/tradingview-sync"

const ENTRY_MATCH_TOLERANCE_MS = 60_000

const INSTRUMENT_ALIASES: Record<string, string[]> = {
  XAUUSD: ["XAUUSD", "XAUUSDT", "XAU", "GOLD"],
  GOLD: ["GOLD", "XAUUSD", "XAUUSDT", "XAU"],
  XAGUSD: ["XAGUSD", "XAG", "SILVER"],
  BTCUSDT: ["BTCUSDT", "BTCUSD", "BTC"],
  BTCUSD: ["BTCUSD", "BTCUSDT", "BTC"],
  ETHUSDT: ["ETHUSDT", "ETHUSD", "ETH"],
  ETHUSD: ["ETHUSD", "ETHUSDT", "ETH"],
  USOIL: ["USOIL", "UKOIL", "WTI", "CRUDE", "OIL"],
}

export type ReconcileOpenTradeHint = {
  externalId?: string
  entryDatetime?: string
  direction?: "long" | "short"
  tradeNumber?: number
}

function instrumentMatchList(instrument: string) {
  const symbol = canonicalInstrumentSymbol(instrument)
  if (!symbol) return []
  return [...new Set([symbol, ...(INSTRUMENT_ALIASES[symbol] || [])])]
}

/**
 * Drop journal "Open" rows that are no longer open on TradingView for this instrument.
 * Refresh only scrapes the top of the list, so closed trades deep in history never update —
 * those stale opens would otherwise stick forever.
 */
export async function reconcileStaleOpenTrades(
  userId: string,
  instrument: string,
  activeOpens: ReconcileOpenTradeHint[],
) {
  const symbols = instrumentMatchList(instrument)
  if (!symbols.length) return 0
  // Empty opens means the scrape did not see a live row — not that TV has none.
  // Never delete journal Opens from that signal (light scrape / collapsed panel).
  if (!activeOpens.length) return 0

  const activeExternalIds = new Set(
    activeOpens.map((open) => open.externalId).filter((id): id is string => Boolean(id)),
  )

  const activeKeys = new Set<string>()
  for (const open of activeOpens) {
    if (!open.entryDatetime || !open.direction) continue
    const entryMs = new Date(normalizeTradingViewDatetime(open.entryDatetime)).getTime()
    if (!Number.isFinite(entryMs)) continue
    activeKeys.add(`${open.direction}:${entryMs}`)
  }

  const candidates = await Trade.find({
    userId,
    source: "tradingview",
    instrument: { $in: symbols },
  }).select("_id external_id entry_date exit_date signal tags trade_type")

  const stale = candidates
    .filter((trade) => isOpenSyncedTrade(trade))
    .filter((trade) => {
      if (trade.external_id && activeExternalIds.has(trade.external_id)) return false

      const direction = trade.trade_type === "Sell" ? "short" : "long"
      const entryMs = trade.entry_date?.getTime?.() ?? new Date(trade.entry_date).getTime()
      if (Number.isFinite(entryMs)) {
        for (const key of activeKeys) {
          const [dir, msText] = key.split(":")
          const ms = Number(msText)
          if (dir === direction && Math.abs(ms - entryMs) <= ENTRY_MATCH_TOLERANCE_MS) {
            return false
          }
        }
      }

      return true
    })

  if (!stale.length) return 0

  const now = new Date()
  for (const trade of stale) {
    await Trade.updateOne({ _id: trade._id, userId }, { $set: { exit_date: now } })
  }
  return stale.length
}

/** Keep the newest live Open per symbol/side. Older leftovers become closed. */
export async function closeDuplicateLiveOpens(userId: string) {
  const opens = await Trade.find({
    userId,
    source: "tradingview",
    $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
  }).sort({ entry_date: -1 })

  const keeperByKey = new Map<string, (typeof opens)[number]>()
  const closed: typeof opens = []

  for (const trade of opens) {
    const symbol = canonicalInstrumentSymbol(trade.instrument) || trade.instrument
    const key = `${symbol}:${trade.trade_type}`
    const keeper = keeperByKey.get(key)
    if (!keeper) {
      keeperByKey.set(key, trade)
      continue
    }

    trade.exit_date = keeper.entry_date || new Date()
    if (keeper.entry_price != null) trade.exit_price = keeper.entry_price
    await trade.save()
    closed.push(trade)
  }

  return closed
}

/**
 * Delete Open rows that are impossible: a later CLOSED trade already exists on the same instrument.
 * Fixes ghost opens (e.g. 09:36 Open while 11:45+ trades are closed) that API capture keeps resurrecting.
 */
export async function purgeSupersededOpenTrades(userId: string, instrument?: string) {
  const query: Record<string, unknown> = {
    userId,
    source: "tradingview",
  }
  if (instrument) {
    const symbols = instrumentMatchList(instrument)
    if (symbols.length) query.instrument = { $in: symbols }
  }

  const trades = await Trade.find(query)
    .select("_id instrument entry_date exit_date signal tags")
    .sort({ entry_date: 1 })
    .lean()

  const maxClosedEntryByInstrument = new Map<string, number>()
  for (const trade of trades) {
    if (isOpenSyncedTrade(trade)) continue
    const entryMs = trade.entry_date ? new Date(trade.entry_date).getTime() : NaN
    if (!Number.isFinite(entryMs)) continue
    const key = String(trade.instrument || "").toUpperCase()
    const prev = maxClosedEntryByInstrument.get(key) ?? -Infinity
    if (entryMs > prev) maxClosedEntryByInstrument.set(key, entryMs)
  }

  const staleIds = trades
    .filter((trade) => isOpenSyncedTrade(trade))
    .filter((trade) => {
      const key = String(trade.instrument || "").toUpperCase()
      const maxClosed = maxClosedEntryByInstrument.get(key)
      if (maxClosed == null || !Number.isFinite(maxClosed)) return false
      const entryMs = trade.entry_date ? new Date(trade.entry_date).getTime() : NaN
      return Number.isFinite(entryMs) && entryMs < maxClosed
    })
    .map((trade) => trade._id)

  if (!staleIds.length) return 0

  const result = await Trade.deleteMany({ _id: { $in: staleIds }, userId })
  return result.deletedCount ?? 0
}
