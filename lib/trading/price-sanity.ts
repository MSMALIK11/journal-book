import { isOpenTvTrade } from "@/lib/trading/tradingview-open"
import {
  normalizeTradingViewDatetime,
  type TradingViewTradeInput,
} from "@/lib/validations/tradingview-sync"

/** Reject cross-symbol sync leftovers (e.g. BTC ~64k stamped as XAUUSD). */
export function priceMatchesInstrument(price: number | null | undefined, instrument: string): boolean {
  if (price == null || !Number.isFinite(price) || price <= 0) return false

  const s = instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()

  if (/^(XAU|GOLD)/.test(s)) return price >= 500 && price <= 15000
  if (/^(XAG|SILVER)/.test(s)) return price >= 5 && price <= 200
  if (/BTC/.test(s)) return price >= 5000 && price <= 500000
  if (/ETH/.test(s)) return price >= 50 && price <= 50000
  if (/SOL/.test(s)) return price >= 1 && price <= 5000
  if (/^(USOIL|UKOIL|WTI|CRUDE|OIL|CL)/.test(s)) return price >= 10 && price <= 500

  // Forex / unknown — block absurd crypto-scale prices
  if (price >= 20000) return false
  return true
}

function entryMs(trade: TradingViewTradeInput) {
  try {
    const ms = new Date(normalizeTradingViewDatetime(trade.entry.datetime)).getTime()
    return Number.isFinite(ms) ? ms : NaN
  } catch {
    return NaN
  }
}

/** Drop mid-history ghost Opens when the same payload already has a later closed trade. */
export function dropSupersededOpenTradesFromPayload(trades: TradingViewTradeInput[]) {
  if (trades.length < 2) return trades

  const maxClosedEntryByInstrument = new Map<string, number>()
  const maxClosedNumberByInstrument = new Map<string, number>()

  for (const trade of trades) {
    if (isOpenTvTrade(trade)) continue
    const symbol = trade.instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    const ms = entryMs(trade)
    if (Number.isFinite(ms)) {
      const prev = maxClosedEntryByInstrument.get(symbol) ?? -Infinity
      if (ms > prev) maxClosedEntryByInstrument.set(symbol, ms)
    }
    const prevNum = maxClosedNumberByInstrument.get(symbol) ?? -Infinity
    if (trade.tradeNumber > prevNum) maxClosedNumberByInstrument.set(symbol, trade.tradeNumber)
  }

  return trades.filter((trade) => {
    if (!isOpenTvTrade(trade)) return true
    const symbol = trade.instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    const maxNum = maxClosedNumberByInstrument.get(symbol)
    if (maxNum != null && trade.tradeNumber >= maxNum) return true
    if (maxNum != null && trade.tradeNumber < maxNum) return false
    const ms = entryMs(trade)
    const maxClosed = maxClosedEntryByInstrument.get(symbol)
    if (maxClosed != null && Number.isFinite(ms) && ms < maxClosed) return false
    return true
  })
}
