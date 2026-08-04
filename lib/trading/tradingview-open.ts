/** TradingView marks the exit leg with signal "Open" while the position is still running. */
export function isOpenTvSignal(signal?: string | null) {
  return (signal || "").trim().toLowerCase() === "open"
}

export function isOpenTvTrade(trade: {
  entry?: { signal?: string }
  exit?: { signal?: string } | null
}) {
  if (!trade.exit) return true
  if (isOpenTvSignal(trade.exit.signal)) return true
  // TV sometimes renders "Open" in the entry half of the signal cell.
  if (isOpenTvSignal(trade.entry?.signal)) return true
  return false
}

export function isOpenSyncedTrade(trade: {
  exit_date?: Date | string | null
  signal?: string | null
  tags?: string[] | null
}) {
  if (!trade.exit_date) return true
  if (isOpenTvSignal(trade.signal)) return true
  return (trade.tags || []).some((tag) => isOpenTvSignal(tag))
}
