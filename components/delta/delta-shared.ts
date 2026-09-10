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
  createdAt?: string
}

export const DEMO_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XAUTUSD"] as const

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

export function orderRowPnl(order: OrderRow, positions: PositionRow[]): number | undefined {
  const match = positions.find(
    (p) =>
      p.accountId === order.accountId &&
      p.symbol === order.symbol &&
      p.side !== "flat" &&
      p.size > 0,
  )
  return match?.unrealizedPnl
}
