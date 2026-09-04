import "server-only"

import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"
import { estimateClosedTradeMetrics } from "@/lib/trading/close-pnl"
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
  }).select(
    "_id external_id entry_date exit_date signal tags trade_type entry_price quantity contract_size instrument",
  )

  const openRows = candidates.filter((trade) => isOpenSyncedTrade(trade))
  const stale = openRows.filter((trade) => {
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

  const keepers = openRows.filter((trade) => !stale.includes(trade))
  const now = new Date()
  for (const trade of stale) {
    const symbol = canonicalInstrumentSymbol(trade.instrument) || trade.instrument
    const keeper = keepers
      .filter((row) => {
        const rowSymbol = canonicalInstrumentSymbol(row.instrument) || row.instrument
        return rowSymbol === symbol && row.trade_type === trade.trade_type
      })
      .sort((a, b) => (b.entry_date?.getTime?.() ?? 0) - (a.entry_date?.getTime?.() ?? 0))[0]

    const exit_price = keeper?.entry_price ?? trade.entry_price
    const exit_date = keeper?.entry_date || now
    const metrics = estimateClosedTradeMetrics({
      trade_type: trade.trade_type,
      entry_price: trade.entry_price,
      exit_price,
      quantity: trade.quantity,
      contract_size: trade.contract_size,
    })
    await Trade.updateOne(
      { _id: trade._id, userId },
      {
        $set: {
          exit_date,
          exit_price,
          net_pnl: metrics.net_pnl,
          return_pct: metrics.return_pct,
        },
      },
    )
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
    if (trade.exit_price != null && typeof trade.net_pnl !== "number") {
      const metrics = estimateClosedTradeMetrics({
        trade_type: trade.trade_type,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        quantity: trade.quantity,
        contract_size: trade.contract_size,
      })
      trade.net_pnl = metrics.net_pnl
      trade.return_pct = metrics.return_pct
    }
    await trade.save()
    closed.push(trade)
  }

  return closed
}

/** Fill leftover-Open closes that only got an exit time (no price / P&L). */
export async function healIncompleteTvCloses(userId: string) {
  const broken = await Trade.find({
    userId,
    source: "tradingview",
    exit_date: { $exists: true, $ne: null },
    $or: [
      { exit_price: { $exists: false } },
      { exit_price: null },
      { net_pnl: { $exists: false } },
      { net_pnl: null },
    ],
  })
  if (!broken.length) {
    return { healed: 0, touches: [] as { accountId: string; instrument: string; updated: number }[] }
  }

  const opens = await Trade.find({
    userId,
    source: "tradingview",
    $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
  })

  let healed = 0
  const touches = new Map<string, { accountId: string; instrument: string; updated: number }>()
  for (const trade of broken) {
    const symbol = canonicalInstrumentSymbol(trade.instrument) || trade.instrument
    const keeper = opens
      .filter((open) => {
        const openSymbol = canonicalInstrumentSymbol(open.instrument) || open.instrument
        return (
          openSymbol === symbol &&
          open.trade_type === trade.trade_type &&
          (open.entry_date?.getTime?.() ?? 0) >= (trade.entry_date?.getTime?.() ?? 0)
        )
      })
      .sort((a, b) => (b.entry_date?.getTime?.() ?? 0) - (a.entry_date?.getTime?.() ?? 0))[0]

    const exit_price = trade.exit_price ?? keeper?.entry_price
    if (exit_price == null || !Number.isFinite(exit_price) || exit_price <= 0) continue

    const metrics = estimateClosedTradeMetrics({
      trade_type: trade.trade_type,
      entry_price: trade.entry_price,
      exit_price,
      quantity: trade.quantity,
      contract_size: trade.contract_size,
    })

    const patch: Record<string, unknown> = {}
    if (trade.exit_price == null) patch.exit_price = exit_price
    if (typeof trade.net_pnl !== "number") patch.net_pnl = metrics.net_pnl
    if (typeof trade.return_pct !== "number") patch.return_pct = metrics.return_pct
    if (!Object.keys(patch).length) continue

    await Trade.updateOne({ _id: trade._id, userId }, { $set: patch })
    healed += 1
    const accountId = String(trade.accountId)
    const prior = touches.get(accountId)
    if (prior) {
      prior.updated += 1
    } else {
      touches.set(accountId, { accountId, instrument: symbol, updated: 1 })
    }
  }

  return { healed, touches: [...touches.values()] }
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
