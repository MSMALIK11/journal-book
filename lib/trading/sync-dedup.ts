import Trade from "@/app/api/models/Trade"
import type { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { buildLegacyExternalId } from "@/lib/validations/tradingview-sync"

/** Allow small clock/format drift when matching legacy trade-number IDs. */
const ENTRY_MATCH_TOLERANCE_MS = 60_000
const LIVE_OPEN_ENTRY_SLOP_MS = 10 * 60_000
const SAME_FILL_PRICE_TOLERANCE = 0.001

type MappedTrade = ReturnType<typeof mapTradingViewTrade>

function sameEntryPrice(a?: number | null, b?: number | null) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !a) return false
  return Math.abs((a as number) - (b as number)) / Math.abs(a as number) <= SAME_FILL_PRICE_TOLERANCE
}

function sameLiveFill(
  liveOpen: { entry_price?: number | null; external_id?: string | null },
  mapped: MappedTrade,
  legacyStrategy: string,
  legacyTradeNumber: number,
) {
  if (sameEntryPrice(liveOpen.entry_price, mapped.entry_price)) return true
  const legacyId = buildLegacyExternalId(legacyStrategy, legacyTradeNumber)
  return Boolean(liveOpen.external_id && liveOpen.external_id === legacyId)
}

/**
 * Find an existing synced trade for this user — searches across all accounts
 * so the same TV trade is never inserted twice when it moves between portfolios.
 */
export async function findExistingSyncedTrade(
  userId: string,
  accountId: string,
  mapped: MappedTrade,
  legacyStrategy: string,
  legacyTradeNumber: number,
) {
  if (mapped.external_id) {
    const byExternalId = await Trade.findOne({ userId, external_id: mapped.external_id })
    if (byExternalId) return byExternalId
  }

  const legacyId = buildLegacyExternalId(legacyStrategy, legacyTradeNumber)
  const legacyMatch = await Trade.findOne({ userId, external_id: legacyId })
  if (legacyMatch) {
    const entryDelta = Math.abs(legacyMatch.entry_date.getTime() - mapped.entry_date.getTime())
    if (
      entryDelta <= ENTRY_MATCH_TOLERANCE_MS &&
      legacyMatch.instrument === mapped.instrument &&
      legacyMatch.trade_type === mapped.trade_type &&
      !isClosedMismatch(legacyMatch, mapped)
    ) {
      return legacyMatch
    }
  }

  const exact = await Trade.findOne({
    userId,
    source: "tradingview",
    instrument: mapped.instrument,
    entry_date: mapped.entry_date,
    trade_type: mapped.trade_type,
  })
  if (exact && !isClosedMismatch(exact, mapped)) return exact

  const entryMs = mapped.entry_date.getTime()
  if (!Number.isFinite(entryMs)) return null

  const fuzzy = await Trade.findOne({
    userId,
    source: "tradingview",
    instrument: mapped.instrument,
    trade_type: mapped.trade_type,
    entry_date: {
      $gte: new Date(entryMs - ENTRY_MATCH_TOLERANCE_MS),
      $lte: new Date(entryMs + ENTRY_MATCH_TOLERANCE_MS),
    },
  }).sort({ updatedAt: -1 })
  if (fuzzy && !isClosedMismatch(fuzzy, mapped)) return fuzzy

  // Incoming Open: attach to the live Open only when it is the same fill.
  // A new TV number / different entry price is a new trade and must alert.
  if (!mapped.exit_date) {
    const liveOpen = await Trade.findOne({
      userId,
      source: "tradingview",
      instrument: mapped.instrument,
      trade_type: mapped.trade_type,
      $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
    }).sort({ entry_date: -1 })
    if (liveOpen && sameLiveFill(liveOpen, mapped, legacyStrategy, legacyTradeNumber)) {
      return liveOpen
    }
  }

  // Close payload often retimes the row. Attach it to the live Open only when
  // it is the same fill — an older closed row must not close a newer live Open.
  if (mapped.exit_date) {
    const liveOpen = await Trade.findOne({
      userId,
      source: "tradingview",
      instrument: mapped.instrument,
      trade_type: mapped.trade_type,
      $or: [{ exit_date: null }, { exit_date: { $exists: false } }],
    }).sort({ entry_date: -1 })
    if (liveOpen) {
      const liveEntryMs = liveOpen.entry_date?.getTime?.() ?? NaN
      const mappedEntryMs = mapped.entry_date.getTime()
      const mappedExitMs = mapped.exit_date.getTime()
      if (Number.isFinite(liveEntryMs) && mappedExitMs < liveEntryMs - LIVE_OPEN_ENTRY_SLOP_MS) {
        return null
      }
      if (
        sameLiveFill(liveOpen, mapped, legacyStrategy, legacyTradeNumber) ||
        !Number.isFinite(liveEntryMs) ||
        Math.abs(liveEntryMs - mappedEntryMs) <= LIVE_OPEN_ENTRY_SLOP_MS
      ) {
        return liveOpen
      }
    }
  }

  return null
}

/** A new TV Open must not reuse a different closed row — that counts as update and skips the alarm. */
function isClosedMismatch(
  existing: { exit_date?: Date | null; external_id?: string | null },
  mapped: MappedTrade,
) {
  if (mapped.exit_date) return false
  if (!existing.exit_date) return false
  return existing.external_id !== mapped.external_id
}

export function shouldMigrateExternalId(existing: { external_id?: string | null }, mapped: MappedTrade) {
  return Boolean(mapped.external_id && existing.external_id !== mapped.external_id)
}

/** Remove duplicate rows that share the same external_id within a user. Keeps the newest row. */
export async function dedupeSyncedTradesByExternalId(userId: string) {
  const groups = await Trade.aggregate<{ _id: string; ids: unknown[] }>([
    {
      $match: {
        userId,
        source: "tradingview",
        external_id: { $exists: true, $nin: [null, ""] },
      },
    },
    { $group: { _id: "$external_id", ids: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ])

  let removed = 0
  for (const group of groups) {
    const ids = group.ids.map(String)
    const rows = await Trade.find({ _id: { $in: ids } })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select("_id")
    const [, ...toDelete] = rows
    if (!toDelete.length) continue
    const result = await Trade.deleteMany({ _id: { $in: toDelete.map((r) => r._id) } })
    removed += result.deletedCount ?? 0
  }

  return removed
}
