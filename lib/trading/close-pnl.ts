import { INSTRUMENTS } from "@/lib/instruments"
import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"

type ClosedTradeInput = {
  trade_type: "Buy" | "Sell"
  entry_price: number
  exit_price: number
  quantity?: number
  contract_size?: number
  instrument?: string
  net_pnl?: number | null
  return_pct?: number | null
  /** Profit cell scraped from TV List of trades — prefer when sane. */
  tv_scraped_profit?: number | null
  tv_scraped_return_pct?: number | null
}

export type SanitizeClosedEconomicsOptions = {
  /** DB heal / synthetic close — derive from fills, do not reuse poisoned stored P&L. */
  fillOnly?: boolean
}

function lotAndContract(trade: Pick<ClosedTradeInput, "quantity" | "contract_size" | "instrument">) {
  const qty = Number(trade.quantity)
  const size = Number(trade.contract_size)
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1
  if (Number.isFinite(size) && size > 0) return { quantity, contract: size }
  const symbol = trade.instrument ? canonicalInstrumentSymbol(trade.instrument) : ""
  const spec = symbol ? INSTRUMENTS[symbol] : undefined
  return { quantity, contract: spec?.contractSize && spec.contractSize > 0 ? spec.contractSize : 1 }
}

function isMetalFill(trade: { instrument?: string }) {
  const symbol = canonicalInstrumentSymbol(String(trade.instrument || ""))
  if (/XAU|GOLD|XAG/.test(symbol)) return true
  const spec = symbol ? INSTRUMENTS[symbol] : undefined
  return spec?.assetType === "metal"
}

/** TV Strategy Tester USDJPY — Profit column is quote (JPY), size is base units (usually 100). */
function isUsdJpyFill(trade: { instrument?: string }) {
  return canonicalInstrumentSymbol(String(trade.instrument || "")) === "USDJPY"
}

function usdJpyTesterSize(trade: Pick<ClosedTradeInput, "quantity">) {
  const raw = Number(trade.quantity)
  if (Number.isFinite(raw) && raw > 0) return raw
  return 100
}

function usdJpyQuotePnl(trade: ClosedTradeInput) {
  const quantity = usdJpyTesterSize(trade)
  return Math.round(unitFillMove(trade) * quantity * 100) / 100
}

function shouldTrustUsdJpyTvProfit(trade: ClosedTradeInput, incoming: number, fill: number) {
  if (!Number.isFinite(incoming)) return false
  const slack = Math.max(1, Math.abs(fill) * 0.08)
  if (Math.abs(incoming - fill) <= slack) return true
  if (returnPctMatchesFill(trade, 0.25)) return true
  return false
}

function isCryptoFill(trade: ClosedTradeInput) {
  if (isMetalFill(trade)) return false
  const symbol = canonicalInstrumentSymbol(String(trade.instrument || ""))
  if (/BTC|ETH|SOL/.test(symbol)) return true
  const spec = symbol ? INSTRUMENTS[symbol] : undefined
  if (spec?.assetType === "crypto") return true
  if (spec?.assetType && spec.assetType !== "crypto") return false
  const price = Number(trade.entry_price)
  const contract = Number(trade.contract_size)
  return price >= 1000 && (!Number.isFinite(contract) || contract === 1)
}

/** Gold Strategy Tester Size 10 oz. */
const GOLD_TESTER_LOTS = 10

/** Default BTC tester size when legacy rows were poisoned with gold qty=10. */
const LEGACY_CRYPTO_TV_SIZE = 0.2

function unitFillMove(trade: ClosedTradeInput) {
  const delta = trade.exit_price - trade.entry_price
  const signed = trade.trade_type === "Buy" ? delta : -delta
  return Math.round(signed * 100) / 100
}

function nearlyEqual(a: number, b: number, ratio = 0.03) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / scale <= ratio
}

function isLegacyCryptoSize10Poison(trade: ClosedTradeInput) {
  if (!isCryptoFill(trade)) return false
  const raw = Number(trade.quantity)
  const incoming = Number(trade.net_pnl)
  const unit = unitFillMove(trade)
  if (!Number.isFinite(incoming) || Math.abs(unit) < 0.05) return false
  if (Number.isFinite(raw) && raw >= 9 && raw <= 11) {
    return nearlyEqual(Math.abs(incoming), Math.abs(unit * raw), 0.06)
  }
  // Stored qty can be 0.2 while scraped $ P&L used gold tester lot (10 × $/point).
  return nearlyEqual(Math.abs(incoming), Math.abs(unit * GOLD_TESTER_LOTS), 0.06)
}

/** TV scraped size for BTC/ETH/SOL — keep 0.2, 1, etc. Never gold-default 10. */
function cryptoTesterSize(trade: ClosedTradeInput) {
  const raw = Number(trade.quantity)
  const unit = unitFillMove(trade)
  const incoming = Number(trade.net_pnl)

  if (isLegacyCryptoSize10Poison(trade)) return LEGACY_CRYPTO_TV_SIZE

  if (Number.isFinite(raw) && raw > 0 && raw <= 5) return raw

  if (Number.isFinite(incoming) && Math.abs(unit) >= 0.05) {
    const implied = Math.abs(incoming / unit)
    if (implied >= 0.01 && implied <= 5) return Math.round(implied * 1000) / 1000
  }

  if (Number.isFinite(raw) && raw > 5 && raw <= 20) return raw
  return 1
}

function goldTesterSize(trade: ClosedTradeInput) {
  const raw = lotAndContract(trade).quantity
  if (!Number.isFinite(raw) || raw <= 1 || raw > 20) return GOLD_TESTER_LOTS
  return raw
}

function sizeForFill(trade: ClosedTradeInput) {
  if (isMetalFill(trade)) return goldTesterSize(trade)
  if (isCryptoFill(trade)) return cryptoTesterSize(trade)
  if (isUsdJpyFill(trade)) return usdJpyTesterSize(trade)
  const raw = lotAndContract(trade).quantity
  return raw > 20 ? 1 : raw
}

function lotsForPnl(trade: ClosedTradeInput) {
  if (isCryptoFill(trade)) {
    return { quantity: cryptoTesterSize(trade), contract: 1 }
  }
  return lotAndContract(trade)
}

/** Approximate P&L from the fill prices when TradingView's dollar P&L is missing or notional. */
export function estimateClosedTradeMetrics(trade: ClosedTradeInput) {
  const { quantity, contract } = lotsForPnl(trade)
  const delta = trade.exit_price - trade.entry_price
  const signed = trade.trade_type === "Buy" ? delta : -delta
  const net_pnl = Math.round(signed * quantity * contract * 100) / 100
  const return_pct =
    trade.entry_price > 0 ? Math.round((signed / trade.entry_price) * 10000) / 100 : 0
  return { net_pnl, return_pct }
}

function isHighPriceFill(trade: ClosedTradeInput) {
  return isCryptoFill(trade) || isMetalFill(trade) || Number(trade.entry_price) >= 200
}

function trustedTvFillPnl(trade: ClosedTradeInput) {
  return Math.round(unitFillMove(trade) * sizeForFill(trade) * 100) / 100
}

function fillSlack(reference: number, fill: number) {
  return Math.max(2.5, Math.abs(fill) * 0.45, Math.abs(reference) * 0.06)
}

/**
 * Same-bar TV rows sometimes land with entry/exit prices reversed.
 * When TV Profit disagrees in sign but matches in magnitude, swap the fills.
 */
export function alignClosedFillPrices(trade: ClosedTradeInput): ClosedTradeInput {
  const tvProfit = trade.tv_scraped_profit ?? trade.net_pnl
  if (typeof tvProfit !== "number" || !Number.isFinite(tvProfit) || Math.abs(tvProfit) < 0.01) {
    return trade
  }
  if (!Number.isFinite(trade.entry_price) || !Number.isFinite(trade.exit_price)) return trade

  const fill = trustedTvFillPnl(trade)
  const slack = fillSlack(tvProfit, fill)
  if (Math.abs(tvProfit - fill) <= slack) return trade

  const swapped: ClosedTradeInput = {
    ...trade,
    entry_price: trade.exit_price,
    exit_price: trade.entry_price,
  }
  const swappedFill = trustedTvFillPnl(swapped)
  if (Math.abs(tvProfit - swappedFill) <= slack) return swapped

  if (
    Math.sign(tvProfit) !== Math.sign(fill) &&
    Math.abs(Math.abs(tvProfit) - Math.abs(fill)) <= slack
  ) {
    return swapped
  }

  return trade
}

function trustedReturnPct(trade: ClosedTradeInput) {
  if (trade.entry_price <= 0) return 0
  return Math.round((unitFillMove(trade) / trade.entry_price) * 10000) / 100
}

function scrapedReturnPct(trade: ClosedTradeInput) {
  const tv = trade.tv_scraped_return_pct ?? trade.return_pct
  return typeof tv === "number" && Number.isFinite(tv) ? tv : null
}

function returnPctMatchesFill(trade: ClosedTradeInput, tolerance = 0.12) {
  const tvReturn = scrapedReturnPct(trade)
  if (tvReturn == null) return true
  const priceReturn = Math.abs(unitFillMove(trade) / trade.entry_price) * 100
  return Math.abs(Math.abs(tvReturn) - priceReturn) < tolerance
}

function looksLikeNotionalProfit(incoming: number, trade: ClosedTradeInput) {
  const raw = lotAndContract(trade)
  return notionals(trade, raw).some((value) => nearlyEqual(Math.abs(incoming), value))
}

function isCryptoGoldLotScrapedPnl(trade: ClosedTradeInput, incoming: number) {
  if (!isCryptoFill(trade)) return false
  const unit = unitFillMove(trade)
  if (!Number.isFinite(incoming) || !Number.isFinite(unit) || Math.abs(unit) < 0.05) return false
  return nearlyEqual(Math.abs(incoming), Math.abs(unit * GOLD_TESTER_LOTS), 0.06)
}

/** Trust TV Profit column when it looks like a real fill P&L, not position notional. */
export function shouldTrustTvScrapedProfit(trade: ClosedTradeInput, incoming: number, fill: number) {
  if (!Number.isFinite(incoming)) return false
  if (isLegacyCryptoSize10Poison(trade)) return false
  if (isCryptoGoldLotScrapedPnl(trade, incoming)) return false
  const unit = unitFillMove(trade)
  if (isAbsurdIncoming(incoming, unit, trade)) return false
  if (looksLikeNotionalProfit(incoming, trade)) return false

  const slack = Math.max(2.5, Math.abs(fill) * 0.45)
  if (Math.abs(incoming - fill) <= slack) return true

  if (Math.abs(fill) >= 0.01 && Math.sign(incoming) !== Math.sign(fill)) return false

  // Return % can match while $ P&L used gold lot (10) on a BTC 0.2 row — prefer fill math.
  if (isCryptoFill(trade) && Math.abs(fill) >= 0.01 && Math.abs(incoming) > Math.abs(fill) * 3) {
    return false
  }

  // TV profit with matching return % — common on BTC tester rows.
  if (returnPctMatchesFill(trade, 0.25)) return true

  return false
}

function pickReturnPct(trade: ClosedTradeInput, trustTv: boolean) {
  const calc = trustedReturnPct(trade)
  const tv = scrapedReturnPct(trade)
  if (trustTv && tv != null) return tv
  return calc
}

function notionals(trade: ClosedTradeInput, raw: { quantity: number; contract: number }) {
  const entry = Math.abs(trade.entry_price)
  const exit = Math.abs(trade.exit_price)
  return [
    exit * raw.quantity * raw.contract,
    entry * raw.quantity * raw.contract,
    exit * raw.contract,
    entry * raw.contract,
    exit * raw.quantity,
    entry * raw.quantity,
  ].filter((value) => value > 1)
}

function isAbsurdIncoming(incoming: number, unitMove: number, trade: ClosedTradeInput) {
  const price = Math.max(Math.abs(trade.entry_price), Math.abs(trade.exit_price), 1)
  if (Math.abs(unitMove) >= 0.01 && Math.abs(incoming) / Math.abs(unitMove) > 200) return true
  if (isHighPriceFill(trade) && Math.abs(incoming) > price * 8) return true
  return false
}

/** Prefer the fill that matches price-return × size (TV gold is $ / oz, not 100 oz futures). */
function replacementFill(
  trade: ClosedTradeInput,
  unitMove: number,
  testerFill: number,
  specFill: number,
) {
  if (isCryptoFill(trade)) return unitMove * sizeForFill(trade)
  const qty = sizeForFill(trade)
  const ozFill = unitMove * qty
  const fromPct =
    typeof trade.return_pct === "number" && Number.isFinite(trade.return_pct) && trade.entry_price > 0
      ? (trade.return_pct / 100) * trade.entry_price * qty
      : null
  if (fromPct != null && Math.abs(fromPct) >= 0.01) {
    return Math.abs(Math.abs(fromPct) - Math.abs(ozFill)) <= Math.abs(Math.abs(fromPct) - Math.abs(specFill))
      ? ozFill
      : specFill
  }
  return Math.abs(ozFill) >= 0.01 ? ozFill : testerFill
}

/**
 * TradingView's Profit cell is sometimes the position value (lots × contract × price),
 * not the trade P&L. A $7 gold short then shows as ~$739k next to a −0.16% return.
 */
export function resolveClosedTradeMetrics(trade: ClosedTradeInput) {
  const estimated = estimateClosedTradeMetrics(trade)
  const incoming = Number(trade.net_pnl)
  const return_pct = trustedReturnPct(trade)
  const unit = unitFillMove(trade)

  if (isUsdJpyFill(trade)) {
    const quantity = usdJpyTesterSize(trade)
    const fill = usdJpyQuotePnl({ ...trade, quantity })
    const tvProfit = Number(trade.tv_scraped_profit ?? incoming)
    if (shouldTrustUsdJpyTvProfit(trade, tvProfit, fill)) {
      return {
        net_pnl: Math.round(tvProfit * 100) / 100,
        return_pct: pickReturnPct(trade, true),
      }
    }
    return { net_pnl: fill, return_pct: trustedReturnPct(trade) }
  }

  if (isCryptoFill(trade)) {
    const quantity = sizeForFill(trade)
    const fill = Math.round(unit * quantity * 100) / 100

    if (isLegacyCryptoSize10Poison(trade)) {
      return { net_pnl: fill, return_pct: trustedReturnPct(trade) }
    }

    const tvProfit = Number(trade.tv_scraped_profit ?? incoming)
    if (shouldTrustTvScrapedProfit(trade, tvProfit, fill)) {
      return {
        net_pnl: Math.round(tvProfit * 100) / 100,
        return_pct: pickReturnPct(trade, true),
      }
    }

    return { net_pnl: fill, return_pct: trustedReturnPct(trade) }
  }

  if (isHighPriceFill(trade)) {
    const fill = trustedTvFillPnl(trade)
    if (!Number.isFinite(incoming)) return { net_pnl: fill, return_pct }
    const slack = Math.max(2, Math.abs(fill) * 0.35)
    if (Math.abs(incoming - fill) <= slack) {
      return { net_pnl: Math.round(incoming * 100) / 100, return_pct }
    }
    return { net_pnl: fill, return_pct }
  }

  if (!Number.isFinite(incoming)) return estimated

  const raw = lotAndContract(trade)
  const unitMove = estimateClosedTradeMetrics({ ...trade, quantity: 1, contract_size: 1 }).net_pnl
  const testerFill = unitMove * (raw.quantity > 20 ? 1 : raw.quantity)
  const inflatedByTvSize =
    raw.quantity >= 10 &&
    Math.abs(unitMove) >= 0.01 &&
    nearlyEqual(Math.abs(incoming), Math.abs(unitMove * raw.quantity))

  const looksLikeNotional = notionals(trade, raw).some(
    (value) => nearlyEqual(Math.abs(incoming), value),
  )
  const fillCap = Math.max(Math.abs(testerFill), Math.abs(estimated.net_pnl), Math.abs(unitMove)) * 3
  const absurdVsFill =
    (Math.abs(unitMove) >= 0.01 && Math.abs(incoming) > fillCap) ||
    isAbsurdIncoming(incoming, unitMove, trade)

  if (inflatedByTvSize || looksLikeNotional || absurdVsFill) {
    const fillPnl = replacementFill(trade, unitMove, testerFill, estimated.net_pnl)
    return { net_pnl: Math.round(fillPnl * 100) / 100, return_pct }
  }

  return {
    net_pnl: Math.round(incoming * 100) / 100,
    return_pct,
  }
}

export function clampTvCryptoQuantity(trade: {
  instrument?: string
  entry_price?: number
  contract_size?: number
  quantity?: number
}) {
  const probe: ClosedTradeInput = {
    trade_type: "Buy",
    entry_price: Number(trade.entry_price) || 0,
    exit_price: Number(trade.entry_price) || 0,
    quantity: trade.quantity,
    contract_size: trade.contract_size,
    instrument: trade.instrument,
  }
  return cryptoTesterSize(probe)
}

function fillOnlyClosedEconomics(trade: ClosedTradeInput) {
  const quantity = sizeForFill({ ...trade, net_pnl: null, return_pct: null })
  const fill = trustedTvFillPnl({ ...trade, quantity })
  return {
    net_pnl: fill,
    return_pct: trustedReturnPct(trade),
    quantity,
  }
}

/** Gold: Size 10 × $ move. Crypto: TV scraped size (0.2) × $ move, trust TV Profit when sane. */
export function sanitizeTvClosedEconomics(
  trade: ClosedTradeInput,
  options?: SanitizeClosedEconomicsOptions,
) {
  const aligned = options?.fillOnly ? trade : alignClosedFillPrices(trade)

  if (options?.fillOnly) {
    return fillOnlyClosedEconomics(aligned)
  }

  const quantity = sizeForFill(aligned)
  const unit = unitFillMove(aligned)
  const fill = Math.round(unit * quantity * 100) / 100

  if (isUsdJpyFill(aligned)) {
    const jpyFill = usdJpyQuotePnl({ ...aligned, quantity })
    const tvProfit = Number(aligned.tv_scraped_profit ?? aligned.net_pnl)
    const trustTv = shouldTrustUsdJpyTvProfit(aligned, tvProfit, jpyFill)
    return {
      net_pnl: trustTv ? Math.round(tvProfit * 100) / 100 : jpyFill,
      return_pct: pickReturnPct(aligned, trustTv),
      quantity,
    }
  }

  if (isCryptoFill(aligned)) {
    if (isLegacyCryptoSize10Poison(aligned)) {
      return { net_pnl: fill, return_pct: trustedReturnPct(aligned), quantity }
    }

    const tvProfit = Number(aligned.tv_scraped_profit ?? aligned.net_pnl)
    if (shouldTrustTvScrapedProfit(aligned, tvProfit, fill)) {
      return {
        net_pnl: Math.round(tvProfit * 100) / 100,
        return_pct: pickReturnPct(aligned, true),
        quantity,
      }
    }

    return { net_pnl: fill, return_pct: trustedReturnPct(aligned), quantity }
  }

  const fillPnl = trustedTvFillPnl({ ...aligned, quantity })
  const tvProfit = Number(aligned.tv_scraped_profit ?? aligned.net_pnl)
  const trustTv = shouldTrustTvScrapedProfit(aligned, tvProfit, fillPnl)
  const net_pnl = isMetalFill(aligned)
    ? trustTv
      ? Math.round(tvProfit * 100) / 100
      : fillPnl
    : resolveClosedTradeMetrics({ ...aligned, quantity }).net_pnl

  return {
    net_pnl,
    return_pct: pickReturnPct(aligned, trustTv),
    quantity,
  }
}
