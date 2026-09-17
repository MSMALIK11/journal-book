import { parseTradingViewDatetime } from "@/lib/validations/tradingview-sync"

/** TV List of trades writes the literal token "Open" on the live exit half. */
export function isOpenTvSignal(signal?: string | null) {
  return /^open$/i.test(String(signal || "").trim())
}

export function isTpSlSignal(signal?: string | null) {
  return /\b(tp\/sl|take\s*profit|stop\s*loss|\btp\b|\bsl\b|stop|target)\b/i.test(
    String(signal || "").trim(),
  )
}

function datetimeMs(value?: string | null) {
  const raw = String(value || "").trim()
  if (!raw || isOpenTvSignal(raw)) return NaN
  try {
    const ms = parseTradingViewDatetime(raw).getTime()
    return Number.isFinite(ms) ? ms : NaN
  } catch {
    const ms = new Date(raw).getTime()
    return Number.isFinite(ms) ? ms : NaN
  }
}

/** Live Open row often paints current time/price on the exit half — not a TP/SL fill. */
export function isPaintedMtmOpen(trade: {
  entry?: { datetime?: string; price?: number }
  exit?: { datetime?: string; price?: number } | null
}) {
  if (!trade.entry || !trade.exit) return false
  if (isOpenTvSignal(trade.exit.datetime)) return true
  const entryMs = datetimeMs(trade.entry.datetime)
  const exitMs = datetimeMs(trade.exit.datetime)
  const entryPrice = Number(trade.entry.price)
  const exitPrice = Number(trade.exit.price)
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs)) return false
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice <= 0) return false
  const sameBar = Math.abs(exitMs - entryMs) <= 90_000
  const samePrice = Math.abs(exitPrice - entryPrice) / entryPrice <= 0.0002
  return sameBar && samePrice
}

/** TV cells sometimes still contain "Open" even when the parsed half is a live quote. */
function cellMentionsOpen(...parts: (string | undefined | null)[]) {
  return parts.some((part) => /\bopen\b/i.test(String(part || "").trim()))
}

/**
 * Glitchy scrapes paint unrealized P&L on the exit half with a live quote/time.
 * Reversal closes at the same fill price are excluded.
 */
export function isMtmUnrealizedOpen(trade: {
  entry?: { datetime?: string; price?: number; signal?: string }
  exit?: { datetime?: string; price?: number; signal?: string } | null
  netPnl?: number
  returnPct?: number
}) {
  if (!trade.entry || !trade.exit) return false
  if (isOpenTvSignal(trade.exit.datetime) || isOpenTvSignal(trade.exit.signal)) return true
  if (isTpSlSignal(trade.exit.signal)) return false

  const entryMs = datetimeMs(trade.entry.datetime)
  const exitMs = datetimeMs(trade.exit.datetime)
  if (!Number.isFinite(entryMs) || !Number.isFinite(exitMs) || exitMs <= entryMs) return false
  if (trade.netPnl == null && trade.returnPct == null) return false

  const entryPrice = Number(trade.entry.price)
  const exitPrice = Number(trade.exit.price)
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || entryPrice <= 0) return false
  if (Math.abs(exitPrice - entryPrice) / entryPrice <= 0.0002) return false

  return true
}

export function isOpenTvTrade(trade: {
  entry?: { datetime?: string; price?: number; signal?: string }
  exit?: { datetime?: string; price?: number; signal?: string } | null
  netPnl?: number
  returnPct?: number
}) {
  if (!trade.exit) return true
  // Date/time cell is the word "Open" — still live, even if Type is Long/Short.
  if (isOpenTvSignal(trade.exit.datetime)) return true

  const leftoverOpen =
    isOpenTvSignal(trade.exit.signal) ||
    isOpenTvSignal(trade.entry?.signal) ||
    cellMentionsOpen(trade.exit.datetime, trade.exit.signal, trade.entry?.signal)
  const confirmedTpSl = isTpSlSignal(trade.exit.signal) && !isOpenTvSignal(trade.exit.signal)
  if (leftoverOpen && !confirmedTpSl) return true

  // Same stamp + same price and no TP/SL = just-opened MTM paint, not a close.
  if (!confirmedTpSl && isPaintedMtmOpen(trade)) return true

  // Live quote + unrealized P&L on exit half — not a TP/SL fill.
  if (!confirmedTpSl && isMtmUnrealizedOpen(trade)) return true

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

export type TvActiveOpenHint = {
  externalId?: string
  entryDatetime?: string
  direction?: "long" | "short"
  tradeNumber?: number
}

/** pyramiding=0 — trust the scraped TV table: one live Open row (highest trade #). */
export function pickTvActiveOpens(
  trades: {
    tradeNumber?: number
    direction?: "long" | "short"
    entry?: { datetime?: string }
    exit?: { datetime?: string; signal?: string } | null
    netPnl?: number
    returnPct?: number
  }[],
): TvActiveOpenHint[] {
  const opens = trades.filter((trade) => isOpenTvTrade(trade))
  if (!opens.length) return []

  const live = opens.reduce((best, trade) => {
    const num = Number(trade.tradeNumber) || 0
    const bestNum = Number(best.tradeNumber) || 0
    return num > bestNum ? trade : best
  }, opens[0])

  return [
    {
      entryDatetime: live.entry?.datetime,
      direction: live.direction,
      tradeNumber: live.tradeNumber,
    },
  ]
}
