/** TV List of trades writes the literal token "Open" on the live exit half. */
export function isOpenTvSignal(signal?: string | null) {
  return /^open$/i.test(String(signal || "").trim())
}

export function isOpenTvTrade(trade: {
  entry?: { signal?: string }
  exit?: { datetime?: string; price?: number; signal?: string } | null
}) {
  if (!trade.exit) return true
  // Type can stay Long/Short while Date/time + Signal cells say "Open".
  if (isOpenTvSignal(trade.exit.signal) || isOpenTvSignal(trade.entry?.signal)) return true
  if (isOpenTvSignal(trade.exit.datetime)) return true
  return false
}

/**
 * Pass-through. Previously coerced the latest row per symbol to Open, which
 * turned real TP/SL closes (Type Long/Short) into fake opens. The scraper
 * Type column is the source of truth.
 */
export function markPaintedOpenTrades<T>(trades: T[]): T[] {
  return trades
}

export function isOpenSyncedTrade(trade: {
  exit_date?: Date | string | null
  signal?: string | null
  tags?: string[] | null
}) {
  // Exit timestamp is the source of truth. Leftover signal "Open" must not keep
  // a closed row stuck after TV sends the fill.
  if (trade.exit_date) return false
  return true
}
