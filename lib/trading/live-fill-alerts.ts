import { persistClosedTradeAlert, persistNewTradeAlert } from "@/lib/trading/alerts-server"
import { isFreshOpenFill, LIVE_OPEN_ALERT_MAX_MS } from "@/lib/trading/live-open-alert-timing"
import { isEntryFlipSignal, isTpSlSignal, isTypedExitSignal } from "@/lib/trading/tradingview-open"

export { isFreshOpenFill, LIVE_OPEN_ALERT_MAX_MS } from "@/lib/trading/live-open-alert-timing"

export const RECENT_SCALP_MS = 3 * 60_000

export type LiveFillKind = "open" | "close"
export type LiveFillReason = "new_open" | "reopen" | "live_close" | "recent_scalp_open" | "recent_scalp_close"

export type LiveFillTrade = {
  id: string
  instrument: string
  trade_type: string
  entry_date: string
  entry_price: number
  signal?: string | null
  is_open?: boolean
  exit_date?: string
  exit_price?: number
  net_pnl?: number
  return_pct?: number
}

export type LiveFillEvent = {
  kind: LiveFillKind
  reason: LiveFillReason
  userId: string
  accountId: string
  accountName?: string
  trade: LiveFillTrade
}

export function isRecentScalp(exitDate?: Date | null) {
  if (!exitDate) return false
  const ms = exitDate.getTime()
  return Number.isFinite(ms) && Date.now() - ms <= RECENT_SCALP_MS
}

/** Mapper already treated this as closed. Extra check: real exit fill, not a painted ghost. */
export function isRealLiveClose(mapped: {
  exit_date?: Date | null
  exit_price?: number
  signal?: string | null
  net_pnl?: number
  return_pct?: number
}) {
  if (!mapped.exit_date) return false
  if (!Number.isFinite(mapped.exit_price) || (mapped.exit_price ?? 0) <= 0) return false
  if (isTypedExitSignal(mapped.signal)) return true
  if (isTpSlSignal(mapped.signal)) return true
  if (isEntryFlipSignal(mapped.signal) && !isTpSlSignal(mapped.signal)) {
    return (
      (typeof mapped.net_pnl === "number" && Number.isFinite(mapped.net_pnl)) ||
      (typeof mapped.return_pct === "number" && Number.isFinite(mapped.return_pct))
    )
  }
  if (typeof mapped.net_pnl === "number" && Number.isFinite(mapped.net_pnl)) {
    return true
  }
  if (typeof mapped.return_pct === "number" && Number.isFinite(mapped.return_pct)) {
    return true
  }
  return false
}

export async function flushLiveFillAlerts(events: LiveFillEvent[]) {
  for (const event of events) {
    if (event.kind === "open") {
      await persistNewTradeAlert(event.userId, event.accountId, event.trade, event.accountName)
      continue
    }
    await persistClosedTradeAlert(event.userId, event.accountId, event.trade, event.accountName)
  }
}
