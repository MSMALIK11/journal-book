import { persistClosedTradeAlert, persistNewTradeAlert } from "@/lib/trading/alerts-server"
import { isFlatMtmOpen, isOpenTvTrade, isTpSlSignal } from "@/lib/trading/tradingview-open"

export const RECENT_SCALP_MS = 3 * 60_000
/** Fills older than this are synced silently — no Telegram, in-app alert, or auto-trade. */
export const FRESH_FILL_MS = 5 * 60_000

export type LiveFillKind = "open" | "close"
export type LiveFillReason = "new_open" | "reopen" | "live_close" | "recent_scalp_open" | "recent_scalp_close"

export type LiveFillTrade = {
  id: string
  instrument: string
  trade_type: string
  entry_date: string
  entry_price: number
  signal?: string | null
  stop_loss?: number
  target?: number
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

type LiveCloseTvTrade = {
  entry?: { datetime?: string; price?: number; signal?: string }
  exit?: { datetime?: string; price?: number; signal?: string } | null
  netPnl?: number
  returnPct?: number
}

/** Mapper already treated this as closed. Extra check: real exit fill, not a painted ghost. */
export function isRealLiveClose(
  mapped: {
    exit_date?: Date | null
    exit_price?: number
    signal?: string | null
    stop_loss?: number
    target?: number
    net_pnl?: number
    return_pct?: number
  },
  tvTrade?: LiveCloseTvTrade,
) {
  if (!mapped.exit_date) return false
  if (!Number.isFinite(mapped.exit_price) || (mapped.exit_price ?? 0) <= 0) return false
  if (tvTrade && isOpenTvTrade(tvTrade)) return false
  if (
    tvTrade &&
    isFlatMtmOpen({
      entry: tvTrade.entry,
      exit: tvTrade.exit,
      netPnl: tvTrade.netPnl,
      returnPct: tvTrade.returnPct,
    })
  ) {
    return false
  }
  if (isTpSlSignal(mapped.signal)) return true
  if (typeof mapped.stop_loss === "number" || typeof mapped.target === "number") return true
  if (typeof mapped.net_pnl === "number" && Number.isFinite(mapped.net_pnl)) {
    return true
  }
  if (typeof mapped.return_pct === "number" && Number.isFinite(mapped.return_pct)) {
    return true
  }
  return false
}

export function fillEventTimestamp(event: LiveFillEvent): number | null {
  const raw =
    event.kind === "close"
      ? event.trade.exit_date ?? event.trade.entry_date
      : event.trade.entry_date
  if (!raw) return null
  const ms = new Date(raw).getTime()
  return Number.isFinite(ms) ? ms : null
}

export function isFreshFillEvent(event: LiveFillEvent, nowMs = Date.now()) {
  const fillMs = fillEventTimestamp(event)
  if (fillMs == null) return false
  return nowMs - fillMs <= FRESH_FILL_MS
}

export function partitionFreshFillEvents(events: LiveFillEvent[], nowMs = Date.now()) {
  const fresh: LiveFillEvent[] = []
  const stale: LiveFillEvent[] = []
  for (const event of events) {
    if (isFreshFillEvent(event, nowMs)) fresh.push(event)
    else stale.push(event)
  }
  return { fresh, stale }
}

export async function flushLiveFillAlerts(events: LiveFillEvent[], photo?: Buffer | null) {
  const { fresh } = partitionFreshFillEvents(events)
  if (!fresh.length) return

  const lastIndex = fresh.length - 1
  for (let index = 0; index < fresh.length; index++) {
    const event = fresh[index]
    const eventPhoto = index === lastIndex ? photo : null
    if (event.kind === "open") {
      await persistNewTradeAlert(event.userId, event.accountId, event.trade, event.accountName, eventPhoto)
      continue
    }
    await persistClosedTradeAlert(event.userId, event.accountId, event.trade, event.accountName, eventPhoto)
  }
}
