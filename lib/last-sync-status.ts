export type LastSyncCounts = {
  at?: string | null
  imported?: number
  updated?: number
  skipped?: number
  message?: string
}

function parseTime(value?: string | null) {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function normalizeCounts(raw: Record<string, unknown> | null | undefined): LastSyncCounts | null {
  if (!raw) return null

  const at =
    typeof raw.finishedAt === "string"
      ? raw.finishedAt
      : typeof raw.at === "string"
        ? raw.at
        : null

  return {
    at,
    imported: typeof raw.imported === "number" ? raw.imported : 0,
    updated: typeof raw.updated === "number" ? raw.updated : 0,
    skipped: typeof raw.skipped === "number" ? raw.skipped : 0,
    message: typeof raw.message === "string" ? raw.message : undefined,
  }
}

/** Pick the newest sync result between manual refresh and server trade events. */
export function pickLatestSyncCounts(
  refreshResult?: Record<string, unknown> | null,
  tradeEvent?: LastSyncCounts | null,
): LastSyncCounts | null {
  const fromRefresh = normalizeCounts(refreshResult)
  const fromEvent = tradeEvent?.at ? tradeEvent : null

  if (!fromRefresh && !fromEvent) return null
  if (!fromRefresh) return fromEvent
  if (!fromEvent) return fromRefresh

  return parseTime(fromEvent.at) >= parseTime(fromRefresh.at) ? fromEvent : fromRefresh
}

export function formatLastSyncSummary(counts: LastSyncCounts | null): string {
  if (!counts?.at) return "No sync yet"

  if (counts.message === "No new trades") {
    return "No new trades on TradingView — database unchanged"
  }
  if (counts.message === "Open trade already up to date") {
    return "Open trade already up to date — no duplicate saved"
  }

  const parts: string[] = []
  parts.push(`${counts.imported ?? 0} new`)
  parts.push(`${counts.updated ?? 0} updated`)
  parts.push(`${counts.skipped ?? 0} skipped`)

  return parts.join(" · ")
}

export function formatLastSyncTime(at?: string | null) {
  if (!at) return "—"
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}
