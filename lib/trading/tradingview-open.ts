/** TradingView marks the exit leg with signal "Open" while the position is still running. */
export function isOpenTvSignal(signal?: string | null) {
  return (signal || "").trim().toLowerCase() === "open"
}

export function isOpenTvTrade(trade: {
  entry?: { signal?: string }
  exit?: { datetime?: string; price?: number; signal?: string } | null
}) {
  if (!trade.exit) return true
  // TV paints a live mark-to-market price/time on the Open row. Signal "Open"
  // means the position is still running — never treat that as a close.
  if (isOpenTvSignal(trade.exit.signal) || isOpenTvSignal(trade.entry?.signal)) return true
  return false
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
