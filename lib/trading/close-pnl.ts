/** Approximate P&L when TradingView did not send netPnl (leftover-Open collapse). */
export function estimateClosedTradeMetrics(trade: {
  trade_type: "Buy" | "Sell"
  entry_price: number
  exit_price: number
  quantity?: number
  contract_size?: number
}) {
  const qty = Number(trade.quantity)
  const size = Number(trade.contract_size)
  const quantity = Number.isFinite(qty) && qty > 0 ? qty : 1
  const contract = Number.isFinite(size) && size > 0 ? size : 1
  const delta = trade.exit_price - trade.entry_price
  const signed = trade.trade_type === "Buy" ? delta : -delta
  const net_pnl = Math.round(signed * quantity * contract * 100) / 100
  const return_pct =
    trade.entry_price > 0 ? Math.round((signed / trade.entry_price) * 10000) / 100 : 0
  return { net_pnl, return_pct }
}
