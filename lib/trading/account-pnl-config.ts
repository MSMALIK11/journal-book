/** How closed-trade P&L is stored on TV import (per trading account). */
export type AccountPnlSource = "tv" | "calculated"

export type AccountPnlSettings = {
  /** Default `tv` — save Strategy Tester Profit column on import. */
  pnlSource?: AccountPnlSource
}

export function normalizePnlSource(value: unknown): AccountPnlSource {
  return value === "calculated" ? "calculated" : "tv"
}

export function pnlSourceLabel(source: AccountPnlSource) {
  return source === "tv" ? "TradingView P&L" : "Calculated P&L"
}
