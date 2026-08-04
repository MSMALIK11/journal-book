import Trade from "@/app/api/models/Trade"
import type { mapTradingViewTrade } from "@/lib/trading/tradingview-mapper"
import { buildLegacyExternalId } from "@/lib/validations/tradingview-sync"

/** Allow small clock/format drift when matching legacy trade-number IDs. */
const ENTRY_MATCH_TOLERANCE_MS = 60_000

type MappedTrade = ReturnType<typeof mapTradingViewTrade>

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
      legacyMatch.trade_type === mapped.trade_type
    ) {
      return legacyMatch
    }
  }

  return Trade.findOne({
    userId,
    source: "tradingview",
    instrument: mapped.instrument,
    entry_date: mapped.entry_date,
    trade_type: mapped.trade_type,
  })
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
