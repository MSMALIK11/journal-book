import "server-only"

import Trade from "@/app/api/models/Trade"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"
import { sanitizeTvClosedEconomics, shouldTrustTvScrapedProfit } from "@/lib/trading/close-pnl"
import { extractTradeLevelFields } from "@/lib/trading/signal-levels"
import { sameEntryPrice } from "@/lib/trading/sync-dedup"
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

function tradeSideKey(trade: { instrument?: string; trade_type?: string }) {
  const symbol = canonicalInstrumentSymbol(trade.instrument || "") || trade.instrument || ""
  return `${symbol}:${trade.trade_type}`
}

function matchesActiveOpenHint(
  trade: {
    external_id?: string | null
    entry_date?: Date
    trade_type?: string
  },
  activeOpens: ReconcileOpenTradeHint[],
) {
  if (trade.external_id && activeOpens.some((open) => open.externalId === trade.external_id)) {
    return true
  }

  const direction = trade.trade_type === "Sell" ? "short" : "long"
  const entryMs = trade.entry_date?.getTime?.() ?? new Date(trade.entry_date as Date).getTime()
  if (!Number.isFinite(entryMs)) return false

  return activeOpens.some((open) => {
    if (open.direction !== direction || !open.entryDatetime) return false
    const openMs = new Date(normalizeTradingViewDatetime(open.entryDatetime)).getTime()
    if (!Number.isFinite(openMs)) return false
    return Math.abs(openMs - entryMs) <= ENTRY_MATCH_TOLERANCE_MS
  })
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
  if (!activeOpens.length) return 0

  const candidates = await Trade.find({
    userId,
    source: "tradingview",
    instrument: { $in: symbols },
  }).select(
    "_id external_id entry_date exit_date signal tags trade_type entry_price quantity contract_size instrument",
  )

  const openRows = candidates.filter((trade) => isOpenSyncedTrade(trade))
  const confirmedActive = openRows.filter((trade) => matchesActiveOpenHint(trade, activeOpens))

  const stale = openRows.filter((trade) => {
    if (matchesActiveOpenHint(trade, activeOpens)) return false

    // Same fill repainted on TV (new timestamp) — keep the original open, do not synthetic-close.
    if (confirmedActive.some((active) => sameEntryPrice(trade.entry_price, active.entry_price))) {
      return false
    }

    return true
  })

  if (!stale.length) return 0

  const keepers = openRows.filter((trade) => !stale.includes(trade))
  for (const trade of stale) {
    const symbol = canonicalInstrumentSymbol(trade.instrument) || trade.instrument
    const liveKeeper = [...keepers, ...confirmedActive]
      .filter((row) => {
        const rowSymbol = canonicalInstrumentSymbol(row.instrument) || row.instrument
        return rowSymbol === symbol
      })
      .sort((a, b) => (b.entry_date?.getTime?.() ?? 0) - (a.entry_date?.getTime?.() ?? 0))[0]

    const { exit_date, exit_price } = await findReversalExitFill(userId, trade, {
      entry_date: liveKeeper?.entry_date,
      entry_price: liveKeeper?.entry_price,
    })

    if (
      !exit_date ||
      exit_price == null ||
      !Number.isFinite(exit_price) ||
      exit_price <= 0
    ) {
      continue
    }

    const metrics = sanitizeTvClosedEconomics(
      {
        trade_type: trade.trade_type,
        entry_price: trade.entry_price,
        exit_price,
        quantity: trade.quantity,
        contract_size: trade.contract_size,
        instrument: trade.instrument,
        net_pnl: trade.net_pnl,
        return_pct: trade.return_pct,
      },
      { fillOnly: true },
    )
    await Trade.updateOne(
      { _id: trade._id, userId },
      {
        $set: {
          exit_date,
          exit_price,
          net_pnl: metrics.net_pnl,
          return_pct: metrics.return_pct,
          quantity: metrics.quantity,
        },
      },
    )
  }
  return stale.length
}

/** Keep the newest live Open per symbol/side. Older leftovers become closed — unless same fill. */
export async function closeDuplicateLiveOpens(userId: string) {
  const opens = await Trade.find({
    userId,
    source: "tradingview",
    $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
  }).sort({ entry_date: -1 })

  const keeperByKey = new Map<string, (typeof opens)[number]>()
  const closed: typeof opens = []
  const deletedIds: string[] = []

  for (const trade of opens) {
    const key = tradeSideKey(trade)
    const keeper = keeperByKey.get(key)
    if (!keeper) {
      keeperByKey.set(key, trade)
      continue
    }

    // Same fill scraped again with a new row/time — drop the newer duplicate, keep original open.
    if (sameEntryPrice(trade.entry_price, keeper.entry_price)) {
      const tradeMs = trade.entry_date?.getTime?.() ?? 0
      const keeperMs = keeper.entry_date?.getTime?.() ?? 0
      if (tradeMs >= keeperMs) {
        deletedIds.push(String(trade._id))
      } else {
        deletedIds.push(String(keeper._id))
        keeperByKey.set(key, trade)
      }
      continue
    }

    // Real re-entry on a different fill — close the older leg.
    trade.exit_date = keeper.entry_date || new Date()
    if (keeper.entry_price != null) trade.exit_price = keeper.entry_price
    if (trade.exit_price != null) {
      const metrics = sanitizeTvClosedEconomics(
        {
          trade_type: trade.trade_type,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          quantity: trade.quantity,
          contract_size: trade.contract_size,
          instrument: trade.instrument,
          net_pnl: trade.net_pnl,
          return_pct: trade.return_pct,
        },
        { fillOnly: true },
      )
      trade.net_pnl = metrics.net_pnl
      trade.return_pct = metrics.return_pct
      trade.quantity = metrics.quantity
    }
    await trade.save()
    closed.push(trade)
  }

  if (deletedIds.length) {
    await Trade.deleteMany({ _id: { $in: deletedIds }, userId })
  }

  return closed
}

function liveOpenInstrumentKey(trade: { accountId?: unknown; instrument?: string }) {
  const symbol = canonicalInstrumentSymbol(trade.instrument || "") || String(trade.instrument || "")
  return `${String(trade.accountId || "")}:${symbol}`
}

async function findReversalExitFill(
  userId: string,
  staleOpen: {
    accountId?: unknown
    instrument?: string
    trade_type?: string
    entry_date?: Date
    entry_price?: number
  },
  fallback: { entry_date?: Date | null; entry_price?: number | null },
) {
  const opposite = staleOpen.trade_type === "Sell" ? "Buy" : "Sell"
  const symbols = instrumentMatchList(String(staleOpen.instrument || ""))
  const query: Record<string, unknown> = {
    userId,
    source: "tradingview",
    accountId: String(staleOpen.accountId || ""),
    trade_type: opposite,
    entry_date: { $gt: staleOpen.entry_date },
  }
  if (symbols.length) query.instrument = { $in: symbols }

  const reversal = await Trade.findOne(query)
    .select("entry_date entry_price")
    .sort({ entry_date: 1 })

  if (
    reversal?.entry_date &&
    reversal.entry_price != null &&
    Number.isFinite(reversal.entry_price) &&
    reversal.entry_price > 0
  ) {
    return { exit_date: reversal.entry_date, exit_price: reversal.entry_price }
  }

  const exit_date = fallback.entry_date || new Date()
  const exit_price = fallback.entry_price ?? staleOpen.entry_price
  return { exit_date, exit_price }
}

function applySyntheticClose(
  trade: {
    trade_type?: string
    entry_price?: number
    quantity?: number
    contract_size?: number
    instrument?: string
    net_pnl?: number | null
    return_pct?: number | null
    exit_date?: Date | null
    exit_price?: number | null
    save: () => Promise<unknown>
  },
  exit_date: Date,
  exit_price: number,
) {
  const metrics = sanitizeTvClosedEconomics(
    {
      trade_type: trade.trade_type,
      entry_price: trade.entry_price,
      exit_price,
      quantity: trade.quantity,
      contract_size: trade.contract_size,
      instrument: trade.instrument,
      net_pnl: trade.net_pnl,
      return_pct: trade.return_pct,
    },
    { fillOnly: true },
  )

  trade.exit_date = exit_date
  trade.exit_price = exit_price
  trade.net_pnl = metrics.net_pnl
  trade.return_pct = metrics.return_pct
}

/**
 * pyramiding=0 — only one live position per instrument/account.
 * Close older opens at the first opposite reversal fill, not the newest open row.
 */
export async function enforceOneLiveOpenPerInstrument(userId: string) {
  const opens = await Trade.find({
    userId,
    source: "tradingview",
    $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
  }).sort({ entry_date: -1 })

  const keeperByKey = new Map<string, (typeof opens)[number]>()
  const closed: typeof opens = []

  for (const trade of opens) {
    const key = liveOpenInstrumentKey(trade)
    if (!key || key.endsWith(":")) continue

    const keeper = keeperByKey.get(key)
    if (!keeper) {
      keeperByKey.set(key, trade)
      continue
    }

    const { exit_date, exit_price } = await findReversalExitFill(userId, trade, keeper)
    if (
      !exit_date ||
      exit_price == null ||
      !Number.isFinite(exit_price) ||
      exit_price <= 0
    ) {
      continue
    }

    applySyntheticClose(trade, exit_date, exit_price)
    await trade.save()
    closed.push(trade)
  }

  return closed
}

/** Fix rows synthetic-closed at a later open instead of the actual reversal fill. */
export async function healWrongReversalCloses(userId: string) {
  const recent = await Trade.find({
    userId,
    source: "tradingview",
    exit_date: { $exists: true, $ne: null },
    entry_date: { $exists: true, $ne: null },
  })
    .select(
      "_id accountId instrument trade_type entry_date entry_price exit_date exit_price quantity contract_size net_pnl return_pct",
    )
    .sort({ exit_date: -1 })
    .limit(300)

  let healed = 0
  for (const trade of recent) {
    const { exit_date, exit_price } = await findReversalExitFill(userId, trade, {
      entry_date: trade.exit_date,
      entry_price: trade.exit_price,
    })

    if (
      !exit_date ||
      exit_price == null ||
      !Number.isFinite(exit_price) ||
      exit_price <= 0 ||
      !trade.exit_date
    ) {
      continue
    }

    const currentExitMs = trade.exit_date.getTime()
    const correctExitMs = exit_date.getTime()
    if (Math.abs(currentExitMs - correctExitMs) <= 60_000 && sameEntryPrice(trade.exit_price, exit_price)) {
      continue
    }

    // Only heal when the stored exit is clearly later than the first reversal fill.
    if (correctExitMs >= currentExitMs) continue

    applySyntheticClose(trade, exit_date, exit_price)
    await trade.save()
    healed += 1
  }

  return healed
}

/**
 * Re-open rows that were synthetic-closed at ~same price as entry when a duplicate open existed.
 * Fixes journal showing a fake ~$0 exit while the position is still live on TV.
 */
export async function healMisclosedSameFillOpens(userId: string) {
  const recentlyClosed = await Trade.find({
    userId,
    source: "tradingview",
    exit_date: { $exists: true, $ne: null },
    entry_price: { $exists: true, $ne: null },
    exit_price: { $exists: true, $ne: null },
  })
    .select("_id instrument trade_type entry_date entry_price exit_date exit_price net_pnl return_pct")
    .sort({ exit_date: -1 })
    .limit(200)

  let healed = 0
  for (const trade of recentlyClosed) {
    if (!sameEntryPrice(trade.entry_price, trade.exit_price)) continue

    const pnl = typeof trade.net_pnl === "number" ? trade.net_pnl : NaN
    if (Number.isFinite(pnl) && Math.abs(pnl) > 0.01) continue

    const stillOpen = await Trade.findOne({
      userId,
      source: "tradingview",
      instrument: trade.instrument,
      trade_type: trade.trade_type,
      $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
      entry_date: { $gte: trade.entry_date },
    }).sort({ entry_date: -1 })

    let shouldReopen = Boolean(
      stillOpen && sameEntryPrice(stillOpen.entry_price, trade.entry_price),
    )

    if (!shouldReopen) {
      const newerClosed = await Trade.findOne({
        userId,
        source: "tradingview",
        instrument: trade.instrument,
        trade_type: trade.trade_type,
        exit_date: { $exists: true, $ne: null },
        entry_date: { $gt: trade.entry_date },
      }).select("_id")

      const newerOpen = await Trade.findOne({
        userId,
        source: "tradingview",
        instrument: trade.instrument,
        $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
        entry_date: { $gt: trade.entry_date },
      }).select("_id")

      shouldReopen = !newerClosed && !newerOpen
    }

    if (!shouldReopen) continue

    await Trade.updateOne(
      { _id: trade._id, userId },
      {
        $unset: { exit_date: "", exit_price: "", net_pnl: "", return_pct: "" },
      },
    )
    healed += 1
  }

  return healed
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

    const metrics = sanitizeTvClosedEconomics(
      {
        trade_type: trade.trade_type,
        entry_price: trade.entry_price,
        exit_price,
        quantity: trade.quantity,
        contract_size: trade.contract_size,
        instrument: trade.instrument,
        net_pnl: trade.net_pnl,
        return_pct: trade.return_pct,
      },
      { fillOnly: true },
    )

    const patch: Record<string, unknown> = {}
    if (trade.exit_price == null) patch.exit_price = exit_price
    patch.net_pnl = metrics.net_pnl
    patch.return_pct = metrics.return_pct
    patch.quantity = metrics.quantity
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

/** Rewrite TV closes whose stored $ P&L is position notional, not the fill move. */
export async function healNotionalTvPnls(userId: string, accountId?: string) {
  const query: Record<string, unknown> = {
    userId,
    source: "tradingview",
    exit_date: { $exists: true, $ne: null },
    exit_price: { $exists: true, $ne: null },
    net_pnl: { $exists: true, $ne: null },
  }
  if (accountId) query.accountId = accountId

  const closed = await Trade.find(query).select(
    "_id accountId instrument trade_type entry_price exit_price quantity contract_size net_pnl return_pct",
  )

  const ops: Array<{
    updateOne: { filter: { _id: unknown; userId: string }; update: { $set: Record<string, unknown> } }
  }> = []

  for (const trade of closed) {
    if (trade.exit_price == null) continue

    const fromFill = sanitizeTvClosedEconomics(
      {
        trade_type: trade.trade_type,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        quantity: trade.quantity,
        contract_size: trade.contract_size,
        instrument: trade.instrument,
        net_pnl: trade.net_pnl,
        return_pct: trade.return_pct,
      },
      { fillOnly: true },
    )

    const hybrid =
      typeof trade.net_pnl === "number"
        ? sanitizeTvClosedEconomics({
            trade_type: trade.trade_type,
            entry_price: trade.entry_price,
            exit_price: trade.exit_price,
            quantity: trade.quantity,
            contract_size: trade.contract_size,
            instrument: trade.instrument,
            net_pnl: trade.net_pnl,
            return_pct: trade.return_pct,
            tv_scraped_profit: trade.net_pnl,
            tv_scraped_return_pct: trade.return_pct,
          })
        : fromFill

    const metrics =
      typeof trade.net_pnl === "number" &&
      shouldTrustTvScrapedProfit(
        {
          trade_type: trade.trade_type,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price,
          quantity: trade.quantity,
          contract_size: trade.contract_size,
          instrument: trade.instrument,
          net_pnl: trade.net_pnl,
          return_pct: trade.return_pct,
        },
        trade.net_pnl,
        fromFill.net_pnl,
      )
        ? hybrid
        : fromFill

    const pnlChanged = Math.abs(metrics.net_pnl - (trade.net_pnl ?? 0)) >= 0.02
    const qtyChanged = metrics.quantity !== trade.quantity
    const pctChanged = Math.abs((metrics.return_pct ?? 0) - (trade.return_pct ?? 0)) >= 0.01
    if (!pnlChanged && !qtyChanged && !pctChanged) continue
    ops.push({
      updateOne: {
        filter: { _id: trade._id, userId },
        update: {
          $set: {
            net_pnl: metrics.net_pnl,
            return_pct: metrics.return_pct,
            quantity: metrics.quantity,
          },
        },
      },
    })
  }

  if (ops.length) await Trade.bulkWrite(ops)
  return ops.length
}

/** Extract TP/SL from signal/tags and persist them on the trade documents. */
export async function healSignalLevels(userId: string, accountId?: string) {
  const query: Record<string, unknown> = {
    userId,
    source: "tradingview",
    $or: [
      { signal: { $regex: /(?:TP|SL)\s*:|TP\s*\/\s*SL|take\s*profit|stop\s*loss/i } },
      { signal: { $regex: /\b(?:long|short|open)\b.+\b(?:long|short|open)\b/i } },
      {
        $and: [
          { $or: [{ stop_loss: { $exists: false } }, { stop_loss: null }] },
          { tags: { $regex: /(?:TP|SL)\s*:/i } },
        ],
      },
      {
        $and: [
          { $or: [{ target: { $exists: false } }, { target: null }] },
          { tags: { $regex: /(?:TP|SL)\s*:/i } },
        ],
      },
    ],
  }
  if (accountId) query.accountId = accountId

  const rows = await Trade.find(query).select("_id signal tags stop_loss target")
  const ops: Array<{
    updateOne: { filter: { _id: unknown; userId: string }; update: { $set: Record<string, unknown> } }
  }> = []

  for (const trade of rows) {
    const next = extractTradeLevelFields({
      signal: trade.signal,
      tags: trade.tags,
      stop_loss: trade.stop_loss,
      target: trade.target,
    })
    const $set: Record<string, unknown> = {}
    if (next.signal && next.signal !== trade.signal) $set.signal = next.signal
    if (next.stop_loss != null && next.stop_loss !== trade.stop_loss) $set.stop_loss = next.stop_loss
    if (next.target != null && next.target !== trade.target) $set.target = next.target
    if (Object.keys($set).length === 0) continue
    ops.push({ updateOne: { filter: { _id: trade._id, userId }, update: { $set } } })
  }

  if (ops.length) await Trade.bulkWrite(ops)
  return ops.length
}

export type PurgeSupersededResult = {
  deleted: number
  touches: { accountId: string; instrument: string }[]
}

/**
 * Delete Open rows that cannot still be live: a later same-side CLOSE already
 * exited after this open's entry (API capture often stamps a later bar/MTM price
 * as a second Open, e.g. 20:30 ghost after a 20:00→21:45 fill).
 */
export async function purgeSupersededOpenTrades(userId: string, instrument?: string): Promise<PurgeSupersededResult> {
  const empty: PurgeSupersededResult = { deleted: 0, touches: [] }
  const query: Record<string, unknown> = {
    userId,
    source: "tradingview",
  }
  if (instrument) {
    const symbols = instrumentMatchList(instrument)
    if (symbols.length) query.instrument = { $in: symbols }
  }

  const trades = await Trade.find(query)
    .select("_id accountId instrument trade_type entry_date exit_date")
    .sort({ entry_date: 1 })
    .lean()

  const maxClosedExitBySide = new Map<string, number>()
  for (const trade of trades) {
    if (isOpenSyncedTrade(trade) || !trade.exit_date) continue
    const exitMs = new Date(trade.exit_date).getTime()
    if (!Number.isFinite(exitMs)) continue
    const key = tradeSideKey(trade)
    const prev = maxClosedExitBySide.get(key) ?? -Infinity
    if (exitMs > prev) maxClosedExitBySide.set(key, exitMs)
  }

  const stale = trades.filter((trade) => {
    if (!isOpenSyncedTrade(trade)) return false
    const entryMs = trade.entry_date ? new Date(trade.entry_date).getTime() : NaN
    if (!Number.isFinite(entryMs)) return false
    const maxExit = maxClosedExitBySide.get(tradeSideKey(trade))
    return maxExit != null && entryMs < maxExit
  })

  if (!stale.length) return empty

  const result = await Trade.deleteMany({ _id: { $in: stale.map((trade) => trade._id) }, userId })
  const touches = new Map<string, { accountId: string; instrument: string }>()
  for (const trade of stale) {
    const accountId = String(trade.accountId || "")
    if (!accountId || touches.has(accountId)) continue
    touches.set(accountId, {
      accountId,
      instrument: canonicalInstrumentSymbol(String(trade.instrument || "")) || String(trade.instrument || ""),
    })
  }

  return { deleted: result.deletedCount ?? 0, touches: [...touches.values()] }
}
