/** Open-fill alerts only fire when entry is within this window (blocks refetch replay). */
export const LIVE_OPEN_ALERT_MAX_MS = 5 * 60_000

export function isFreshOpenFill(entryDate?: Date | string | null, nowMs = Date.now()) {
  if (!entryDate) return false
  const ms = entryDate instanceof Date ? entryDate.getTime() : new Date(entryDate).getTime()
  return Number.isFinite(ms) && nowMs - ms <= LIVE_OPEN_ALERT_MAX_MS
}
