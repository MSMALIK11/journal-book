import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { withDeltaEnvironment } from "@/lib/broker/delta-env"

export type { DeltaEnvironment }

export type DeltaAccount = {
  id: string
  label: string
  lastFour?: string
  isDefault: boolean
  enabled: boolean
  environment?: DeltaEnvironment
}

export type PositionRow = {
  accountId?: string
  accountLabel?: string
  symbol: string
  side: "long" | "short" | "flat"
  size: number
  entryPrice?: number
  markPrice?: number
  unrealizedPnl?: number
}

export type OrderRow = {
  id: string
  accountId?: string
  accountLabel?: string
  brokerOrderId?: string
  symbol: string
  side: "buy" | "sell"
  size: number
  price?: number
  source?: "manual" | "auto"
  createdAt?: string
}

export const DEMO_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XAUTUSD", "PAXGUSD"] as const

export function deltaActiveTabKey(environment: DeltaEnvironment): string {
  return `delta-${environment}-active-tab`
}

export function deltaApiPath(path: string, environment: DeltaEnvironment): string {
  return withDeltaEnvironment(path, environment)
}

export function formatPrice(value?: number) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

export function formatUsd(value?: number) {
  if (value == null || !Number.isFinite(value)) return "—"
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function pnlClassName(value?: number) {
  if (value == null || !Number.isFinite(value)) return ""
  return value >= 0 ? "text-emerald-400" : "text-rose-400"
}

export function formatSignedUsd(value?: number) {
  if (value == null || !Number.isFinite(value)) return "—"
  const formatted = formatUsd(value)
  return value > 0 ? `+${formatted}` : formatted
}

function entryPriceMatches(orderPrice: number, positionEntry: number): boolean {
  const threshold = Math.max(Math.abs(positionEntry) * 0.0003, 0.05)
  return Math.abs(orderPrice - positionEntry) <= threshold
}

/** True when this fill is the opening leg of a still-open position (not every historical order on the symbol). */
export function orderRowMatchesOpenPosition(order: OrderRow, position: PositionRow): boolean {
  if (order.accountId !== position.accountId) return false
  if (order.symbol !== position.symbol) return false
  if (position.side === "flat" || position.size <= 0) return false

  const opensPosition =
    (order.side === "buy" && position.side === "long") ||
    (order.side === "sell" && position.side === "short")
  if (!opensPosition) return false

  if (position.entryPrice != null && order.price != null) {
    return entryPriceMatches(order.price, position.entryPrice)
  }

  return false
}

export function findOpenPositionForOrder(
  order: OrderRow,
  positions: PositionRow[],
): PositionRow | undefined {
  return positions.find((p) => orderRowMatchesOpenPosition(order, p))
}

/** Unrealized P&L only for the order that opened the current position — not all past fills. */
export function orderRowPnl(order: OrderRow, positions: PositionRow[]): number | undefined {
  return findOpenPositionForOrder(order, positions)?.unrealizedPnl
}
