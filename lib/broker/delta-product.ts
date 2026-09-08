export type DeltaProductInfo = {
  productId: number
  symbol: string
  contractValue: number
  contractUnit: string
  defaultLeverage: number
  maxLeverageNotional: number
  markPrice?: number
}

function toNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function normalizeDeltaProduct(raw: unknown, markPrice?: number): DeltaProductInfo | null {
  if (!raw || typeof raw !== "object") return null
  const row = raw as Record<string, unknown>
  const productId = toNumber(row.id)
  const symbol = typeof row.symbol === "string" ? row.symbol : undefined
  const contractValue = toNumber(row.contract_value)
  if (!productId || !symbol || !contractValue) return null

  return {
    productId,
    symbol,
    contractValue,
    contractUnit: typeof row.contract_unit_currency === "string" ? row.contract_unit_currency : "BTC",
    defaultLeverage: toNumber(row.default_leverage) ?? 10,
    maxLeverageNotional: toNumber(row.max_leverage_notional) ?? 0,
    markPrice,
  }
}

export function lotsToUnderlying(lots: number, contractValue: number): number {
  return lots * contractValue
}

export function notionalUsd(lots: number, contractValue: number, markPrice: number): number {
  return lots * contractValue * markPrice
}

export function marginRequiredUsd(lots: number, contractValue: number, markPrice: number, leverage: number): number {
  if (leverage <= 0) return 0
  return notionalUsd(lots, contractValue, markPrice) / leverage
}

export function lotsFromMarginPct(
  availableMarginUsd: number,
  pct: number,
  contractValue: number,
  markPrice: number,
  leverage: number,
  maxNotionalUsd?: number,
): number {
  if (availableMarginUsd <= 0 || pct <= 0 || contractValue <= 0 || markPrice <= 0 || leverage <= 0) return 1
  const marginBudget = (availableMarginUsd * pct) / 100
  let lots = (marginBudget * leverage) / (contractValue * markPrice)
  if (maxNotionalUsd != null && maxNotionalUsd > 0) {
    const maxLotsByNotional = maxNotionalUsd / (contractValue * markPrice)
    lots = Math.min(lots, maxLotsByNotional)
  }
  return Math.max(1, Math.floor(lots))
}

export function computeOrderTicketLots(input: {
  availableMarginUsd: number
  pct: number
  contractValue: number
  markPrice: number
  leverage: number
  maxNotionalUsd?: number
}): number {
  return lotsFromMarginPct(
    input.availableMarginUsd,
    input.pct,
    input.contractValue,
    input.markPrice,
    input.leverage,
    input.maxNotionalUsd,
  )
}

export const DELTA_LEVERAGE_STEPS = [1, 2, 5, 10, 25, 50, 100] as const

export function nearestLeverageStep(value: number): (typeof DELTA_LEVERAGE_STEPS)[number] {
  return DELTA_LEVERAGE_STEPS.reduce((prev, curr) =>
    Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
  )
}
