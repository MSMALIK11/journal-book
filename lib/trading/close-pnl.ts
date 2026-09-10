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

/** Approximate P&L from the fill prices when TradingView's dollar P&L is missing or notional. */
export function estimateClosedTradeMetrics(trade: ClosedTradeInput) {
  const { quantity, contract } = lotAndContract(trade)
  const delta = trade.exit_price - trade.entry_price
  const signed = trade.trade_type === "Buy" ? delta : -delta
  const net_pnl = Math.round(signed * quantity * contract * 100) / 100
  const return_pct =
    trade.entry_price > 0 ? Math.round((signed / trade.entry_price) * 10000) / 100 : 0
  return { net_pnl, return_pct }
}

function nearlyEqual(a: number, b: number, ratio = 0.03) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / scale <= ratio
}

/**
 * TradingView's Profit cell is sometimes the position value (lots × contract × price),
 * not the trade P&L. A $4 gold move then shows as ~$649k next to a 0.14% return.
 */
export function resolveClosedTradeMetrics(trade: ClosedTradeInput) {
  const estimated = estimateClosedTradeMetrics(trade)
  const incoming = Number(trade.net_pnl)
  if (!Number.isFinite(incoming)) return estimated

  const { quantity, contract } = lotAndContract(trade)
  const notional = Math.abs(trade.exit_price * quantity * contract)
  const looksLikeNotional = notional > 0 && nearlyEqual(Math.abs(incoming), notional)
  const wildlyLargerThanMove =
    Math.abs(estimated.net_pnl) >= 0.01 && Math.abs(incoming) > Math.abs(estimated.net_pnl) * 20

  if (looksLikeNotional || wildlyLargerThanMove) {
    return {
      net_pnl: estimated.net_pnl,
      return_pct:
        typeof trade.return_pct === "number" && Number.isFinite(trade.return_pct)
          ? trade.return_pct
          : estimated.return_pct,
    }
  }

  return {
    net_pnl: Math.round(incoming * 100) / 100,
    return_pct:
      typeof trade.return_pct === "number" && Number.isFinite(trade.return_pct)
        ? trade.return_pct
        : estimated.return_pct,
  }
}
