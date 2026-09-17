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
  if (!Number.isFinite(raw) || raw < 9 || raw > 11) return false
  if (!Number.isFinite(incoming) || Math.abs(unit) < 0.05) return false
  return nearlyEqual(Math.abs(incoming), Math.abs(unit * raw), 0.06)
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

function trustedReturnPct(trade: ClosedTradeInput) {
  if (trade.entry_price <= 0) return 0
  return Math.round((unitFillMove(trade) / trade.entry_price) * 10000) / 100
}

function returnPctMatchesFill(trade: ClosedTradeInput) {
  if (typeof trade.return_pct !== "number" || !Number.isFinite(trade.return_pct)) return true
  const priceReturn = Math.abs(unitFillMove(trade) / trade.entry_price) * 100
  return Math.abs(Math.abs(trade.return_pct) - priceReturn) < 0.12
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

  if (isCryptoFill(trade)) {
    const quantity = sizeForFill(trade)
    const fill = Math.round(unit * quantity * 100) / 100

    if (isLegacyCryptoSize10Poison(trade)) {
      return { net_pnl: fill, return_pct }
    }

    if (Number.isFinite(incoming) && !isAbsurdIncoming(incoming, unit, trade) && returnPctMatchesFill(trade)) {
      const slack = Math.max(1.5, Math.abs(fill) * 0.35)
      if (Math.abs(incoming - fill) <= slack) {
        return { net_pnl: Math.round(incoming * 100) / 100, return_pct }
      }
    }

    return { net_pnl: fill, return_pct }
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

/** Gold: Size 10 × $ move. Crypto: TV scraped size (0.2) × $ move, trust TV Profit when sane. */
export function sanitizeTvClosedEconomics(trade: ClosedTradeInput) {
  const quantity = sizeForFill(trade)
  const return_pct = trustedReturnPct(trade)
  const unit = unitFillMove(trade)
  const fill = Math.round(unit * quantity * 100) / 100

  if (isCryptoFill(trade)) {
    if (isLegacyCryptoSize10Poison(trade)) {
      return { net_pnl: fill, return_pct, quantity }
    }

    const incoming = Number(trade.net_pnl)
    if (Number.isFinite(incoming) && !isAbsurdIncoming(incoming, unit, trade) && returnPctMatchesFill(trade)) {
      const slack = Math.max(1.5, Math.abs(fill) * 0.35)
      const net_pnl =
        Math.abs(incoming - fill) <= slack ? Math.round(incoming * 100) / 100 : fill
      return { net_pnl, return_pct, quantity }
    }

    return { net_pnl: fill, return_pct, quantity }
  }

  const metrics = resolveClosedTradeMetrics({ ...trade, quantity })
  const net_pnl = isMetalFill(trade) ? trustedTvFillPnl({ ...trade, quantity }) : metrics.net_pnl
  return {
    net_pnl,
    return_pct: metrics.return_pct,
    quantity,
  }
}
