import type { InstrumentSpec } from "@/lib/instruments"

export type TradeDirection = "Buy" | "Sell"

export type TradeCalculationInput = {
  entryPrice: number
  exitPrice?: number | null
  size: number
  direction: TradeDirection
  instrument: InstrumentSpec
  accountCurrency?: string
  quoteToAccountRate?: number
}

const round = (value: number, places = 2) => {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

const isPositiveNumber = (value: number) =>
  Number.isFinite(value) && value > 0

function convertQuoteValue(
  value: number,
  instrument: InstrumentSpec,
  marketPrice: number,
  accountCurrency = "USD",
  quoteToAccountRate?: number,
) {
  if (instrument.quoteCurrency === accountCurrency) return value
  if (instrument.baseCurrency === accountCurrency && isPositiveNumber(marketPrice)) {
    return value / marketPrice
  }
  if (quoteToAccountRate && isPositiveNumber(quoteToAccountRate)) {
    return value * quoteToAccountRate
  }
  return null
}

export function calculatePriceMove(
  entryPrice: number,
  exitPrice: number,
  direction: TradeDirection,
) {
  if (!isPositiveNumber(entryPrice) || !isPositiveNumber(exitPrice)) return null
  return direction === "Buy" ? exitPrice - entryPrice : entryPrice - exitPrice
}

export function calculatePips(priceMove: number | null, instrument: InstrumentSpec) {
  if (priceMove === null || !isPositiveNumber(instrument.pipSize)) return null
  return round(priceMove / instrument.pipSize)
}

export function calculateTicks(priceMove: number | null, instrument: InstrumentSpec) {
  if (priceMove === null || !isPositiveNumber(instrument.tickSize)) return null
  return round(priceMove / instrument.tickSize)
}

export function calculateProfit({
  entryPrice,
  exitPrice,
  size,
  direction,
  instrument,
  accountCurrency,
  quoteToAccountRate,
}: TradeCalculationInput) {
  if (
    !exitPrice ||
    !isPositiveNumber(size) ||
    !isPositiveNumber(instrument.contractSize)
  ) return null

  const priceMove = calculatePriceMove(entryPrice, exitPrice, direction)
  if (priceMove === null) return null

  // Pips and ticks are display metrics only; money always comes from price movement.
  const quoteProfit = priceMove * instrument.contractSize * size
  const accountProfit = convertQuoteValue(
    quoteProfit,
    instrument,
    exitPrice,
    accountCurrency,
    quoteToAccountRate,
  )
  return accountProfit === null ? null : round(accountProfit)
}

export function calculateRisk({
  entryPrice,
  stopLoss,
  size,
  instrument,
  accountBalance,
  accountCurrency,
  quoteToAccountRate,
}: {
  entryPrice: number
  stopLoss?: number | null
  size: number
  instrument: InstrumentSpec
  accountBalance?: number | null
  accountCurrency?: string
  quoteToAccountRate?: number
}) {
  if (
    !stopLoss ||
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(stopLoss) ||
    !isPositiveNumber(size) ||
    !isPositiveNumber(instrument.contractSize)
  ) return { amount: null, percentage: null }

  const quoteRisk =
    Math.abs(entryPrice - stopLoss) * instrument.contractSize * size
  const convertedRisk = convertQuoteValue(
    quoteRisk,
    instrument,
    stopLoss,
    accountCurrency,
    quoteToAccountRate,
  )
  if (convertedRisk === null) return { amount: null, percentage: null }
  const amount = round(Math.abs(convertedRisk))
  const percentage =
    accountBalance && isPositiveNumber(accountBalance)
      ? round((amount / accountBalance) * 100)
      : null

  return { amount, percentage }
}

export function calculateRR(profit: number | null, riskAmount: number | null) {
  if (
    profit === null ||
    riskAmount === null ||
    !isPositiveNumber(riskAmount)
  ) return null
  return round(profit / riskAmount)
}

export function calculatePositionValue(
  entryPrice: number,
  size: number,
  instrument: InstrumentSpec,
  accountCurrency = "USD",
  quoteToAccountRate?: number,
) {
  if (
    !isPositiveNumber(entryPrice) ||
    !isPositiveNumber(size) ||
    !isPositiveNumber(instrument.contractSize)
  ) return null

  const quoteValue = entryPrice * instrument.contractSize * size
  const accountValue = convertQuoteValue(
    quoteValue,
    instrument,
    entryPrice,
    accountCurrency,
    quoteToAccountRate,
  )
  return accountValue === null ? null : round(accountValue)
}

export function calculateMargin(positionValue: number | null, leverage?: number | null) {
  if (
    positionValue === null ||
    !isPositiveNumber(positionValue) ||
    !leverage ||
    !isPositiveNumber(leverage)
  ) return null
  return round(positionValue / leverage)
}
