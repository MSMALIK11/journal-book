import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { DELTA_LEVERAGE_STEPS } from "@/lib/broker/delta-product"

export const DELTA_AUTO_TRADE_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD"] as const
export type DeltaAutoTradeSymbol = (typeof DELTA_AUTO_TRADE_SYMBOLS)[number]
export const DELTA_AUTO_TRADE_MARGIN_PCTS = [10, 25, 50, 75, 100] as const
export type DeltaAutoTradeMarginPct = (typeof DELTA_AUTO_TRADE_MARGIN_PCTS)[number]

export type DeltaAutoTradeMode = "single" | "broadcast"

export type DeltaLeverageBySymbol = Partial<Record<DeltaAutoTradeSymbol, number>>

export type DeltaAutoTradeConfig = {
  enabled: boolean
  tradeMode: DeltaAutoTradeMode
  singleAccountId?: string
  broadcastAccountIds?: string[]
  symbol: DeltaAutoTradeSymbol
  marginPct: DeltaAutoTradeMarginPct
  leverageBySymbol?: DeltaLeverageBySymbol
}

export type DeltaAutoTradePreferences = {
  demo?: Partial<DeltaAutoTradeConfig>
  live?: Partial<DeltaAutoTradeConfig>
}

export const DEFAULT_DELTA_AUTO_TRADE_CONFIG: DeltaAutoTradeConfig = {
  enabled: false,
  tradeMode: "single",
  singleAccountId: undefined,
  broadcastAccountIds: [],
  symbol: "BTCUSD",
  marginPct: 25,
}

function normalizeMarginPct(value: unknown): DeltaAutoTradeMarginPct {
  const n = Number(value)
  if (DELTA_AUTO_TRADE_MARGIN_PCTS.includes(n as DeltaAutoTradeMarginPct)) {
    return n as DeltaAutoTradeMarginPct
  }
  return DEFAULT_DELTA_AUTO_TRADE_CONFIG.marginPct
}

function normalizeSymbol(value: unknown): DeltaAutoTradeSymbol {
  const s = typeof value === "string" ? value.toUpperCase() : ""
  if (DELTA_AUTO_TRADE_SYMBOLS.includes(s as DeltaAutoTradeSymbol)) {
    return s as DeltaAutoTradeSymbol
  }
  return DEFAULT_DELTA_AUTO_TRADE_CONFIG.symbol
}

function normalizeLeverageValue(value: unknown): number | undefined {
  const n = Number(value)
  if (DELTA_LEVERAGE_STEPS.includes(n as (typeof DELTA_LEVERAGE_STEPS)[number])) {
    return n
  }
  return undefined
}

function normalizeLeverageBySymbol(value: unknown): DeltaLeverageBySymbol {
  if (!value || typeof value !== "object") return {}
  const row = value as Record<string, unknown>
  const out: DeltaLeverageBySymbol = {}
  for (const sym of DELTA_AUTO_TRADE_SYMBOLS) {
    const lv = normalizeLeverageValue(row[sym])
    if (lv != null) out[sym] = lv
  }
  return out
}

export function getLeverageForSymbol(
  config: DeltaAutoTradeConfig,
  symbol: string,
  fallback = 10,
): number {
  const sym = normalizeSymbol(symbol)
  return config.leverageBySymbol?.[sym] ?? fallback
}

export function normalizeDeltaAutoTradeConfig(
  input: Partial<DeltaAutoTradeConfig> | null | undefined,
): DeltaAutoTradeConfig {
  return {
    enabled: input?.enabled === true,
    tradeMode: input?.tradeMode === "broadcast" ? "broadcast" : "single",
    singleAccountId:
      typeof input?.singleAccountId === "string" && input.singleAccountId.trim()
        ? input.singleAccountId.trim()
        : undefined,
    broadcastAccountIds: Array.isArray(input?.broadcastAccountIds)
      ? input.broadcastAccountIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [],
    symbol: normalizeSymbol(input?.symbol),
    marginPct: normalizeMarginPct(input?.marginPct),
    leverageBySymbol: normalizeLeverageBySymbol(input?.leverageBySymbol),
  }
}

export function getDeltaAutoTradeConfig(
  prefs: DeltaAutoTradePreferences | null | undefined,
  environment: DeltaEnvironment,
): DeltaAutoTradeConfig {
  const raw = environment === "live" ? prefs?.live : prefs?.demo
  return normalizeDeltaAutoTradeConfig(raw)
}
