import { isOpenTvTrade } from "@/lib/trading/tradingview-open"
import {
  normalizeTradingViewDatetime,
  type TradingViewTradeInput,
} from "@/lib/validations/tradingview-sync"

const FIAT_CURRENCIES = new Set([
  "USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ZAR",
  "MXN", "SGD", "HKD", "CNH", "CNY", "INR", "KRW", "THB", "BRL",
])

/** Quotes where one unit of base is worth a lot of quote (USDJPY ~150, USDTRY ~43). */
const HIGH_UNIT_QUOTES = new Set([
  "JPY", "TRY", "ZAR", "MXN", "SEK", "NOK", "DKK", "HUF", "CZK", "INR", "KRW", "THB", "BRL",
])

/** Wide but real FX bands — enough to catch a metal/index print stamped onto a currency pair. */
function fiatPairRange(symbol: string): [number, number] | null {
  if (symbol.length !== 6) return null
  const base = symbol.slice(0, 3)
  const quote = symbol.slice(3)
  if (!FIAT_CURRENCIES.has(base) || !FIAT_CURRENCIES.has(quote)) return null

  return HIGH_UNIT_QUOTES.has(quote) ? [1, 2000] : [0.05, 20]
}

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
  if (/^(US30|US100|US500|NAS100|SPX500|GER40|DE40|UK100|JP225)/.test(s)) {
    return price >= 100 && price <= 200000
  }

  // A currency pair must look like a currency pair — a 4,375 gold print is not GBPUSD.
  const fx = fiatPairRange(s)
  if (fx) return price >= fx[0] && price <= fx[1]

  // Unknown symbol — block absurd crypto-scale prices
  if (price >= 20000) return false
  return true
}

/**
 * The extension's `chartSymbol` can go stale (TradingView leaves an old `?symbol=` in the URL, or
 * another chart tab wins the lookup), and it used to be stamped onto every trade unconditionally —
 * that is how 4,375 gold fills landed under GBPUSD. Trust the chart symbol only when the price
 * actually fits it, otherwise fall back to the instrument the trade carried, and skip when neither
 * is plausible rather than mislabelling the fill.
 */
export function resolveSyncedInstrument(
  price: number | null | undefined,
  chartSymbol: string | null,
  tradeSymbol: string,
): string | null {
  for (const candidate of [chartSymbol, tradeSymbol]) {
    if (candidate && priceMatchesInstrument(price, candidate)) return candidate
  }
  return null
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

  const afterClosed = trades.filter((trade) => {
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

  return keepLatestOpenPerSide(afterClosed)
}

/** Strategy Tester has one live position per symbol/side. Older Opens are leftovers. */
export function keepLatestOpenPerSide(trades: TradingViewTradeInput[]) {
  const latest = new Map<string, { index: number; num: number; ms: number }>()

  trades.forEach((trade, index) => {
    if (!isOpenTvTrade(trade)) return
    const symbol = trade.instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
    const key = `${symbol}:${trade.direction}`
    const ms = entryMs(trade)
    const num = Number.isFinite(trade.tradeNumber) ? trade.tradeNumber : 0
    const prev = latest.get(key)
    if (!prev || num > prev.num || (num === prev.num && (ms || 0) > prev.ms)) {
      latest.set(key, { index, num, ms: Number.isFinite(ms) ? ms : 0 })
    }
  })

  const keep = new Set([...latest.values()].map((item) => item.index))
  return trades.filter((trade, index) => !isOpenTvTrade(trade) || keep.has(index))
}
