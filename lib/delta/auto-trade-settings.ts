import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { DELTA_LEVERAGE_STEPS } from "@/lib/broker/delta-product"

export const DELTA_AUTO_TRADE_SYMBOLS = ["BTCUSD", "ETHUSD", "SOLUSD", "XAUTUSD"] as const
export type DeltaAutoTradeSymbol = (typeof DELTA_AUTO_TRADE_SYMBOLS)[number]
export const DELTA_AUTO_TRADE_MARGIN_PCTS = [10, 25, 50, 75, 100] as const
export type DeltaAutoTradeMarginPct = (typeof DELTA_AUTO_TRADE_MARGIN_PCTS)[number]

export type DeltaAutoTradeMode = "single" | "broadcast"

export type DeltaLeverageBySymbol = Partial<Record<DeltaAutoTradeSymbol, number>>
export type DeltaLotSizeBySymbol = Partial<Record<DeltaAutoTradeSymbol, number>>

export type DeltaAutoTradeConfig = {
  enabled: boolean
  tradeMode: DeltaAutoTradeMode
  singleAccountId?: string
  broadcastAccountIds?: string[]
  symbol: DeltaAutoTradeSymbol
  symbols: DeltaAutoTradeSymbol[]
  marginPct: DeltaAutoTradeMarginPct
  leverageBySymbol?: DeltaLeverageBySymbol
  lotSizeBySymbol?: DeltaLotSizeBySymbol
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
  symbols: ["BTCUSD"],
  marginPct: 25,
}

export function isDeltaAutoTradeSymbol(value: string): value is DeltaAutoTradeSymbol {
  return (DELTA_AUTO_TRADE_SYMBOLS as readonly string[]).includes(value)
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
  if (isDeltaAutoTradeSymbol(s)) return s
  return DEFAULT_DELTA_AUTO_TRADE_CONFIG.symbol
}

function normalizeSymbols(input: Partial<DeltaAutoTradeConfig> | null | undefined): DeltaAutoTradeSymbol[] {
  const seen = new Set<DeltaAutoTradeSymbol>()
  if (Array.isArray(input?.symbols)) {
    for (const row of input.symbols) {
      if (typeof row !== "string") continue
      const s = row.toUpperCase()
      if (isDeltaAutoTradeSymbol(s)) seen.add(s)
    }
  }
  if (seen.size > 0) return [...seen]
  return [normalizeSymbol(input?.symbol)]
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

function normalizeLotSizeBySymbol(value: unknown): DeltaLotSizeBySymbol {
  if (!value || typeof value !== "object") return {}
  const row = value as Record<string, unknown>
  const out: DeltaLotSizeBySymbol = {}
  for (const sym of DELTA_AUTO_TRADE_SYMBOLS) {
    const lots = Number(row[sym])
    if (Number.isSafeInteger(lots) && lots > 0) out[sym] = lots
  }
  return out
}

export function getLeverageForSymbol(
  config: DeltaAutoTradeConfig,
  symbol: string,
  fallback = 10,
): number {
  const s = symbol.toUpperCase()
  if (isDeltaAutoTradeSymbol(s) && config.leverageBySymbol?.[s] != null) {
    return config.leverageBySymbol[s] as number
  }
  return fallback
}

export function getLotSizeForSymbol(config: DeltaAutoTradeConfig, symbol: string): number | undefined {
  const s = symbol.toUpperCase()
  if (!isDeltaAutoTradeSymbol(s)) return undefined
  return config.lotSizeBySymbol?.[s]
}

export function normalizeDeltaAutoTradeConfig(
  input: Partial<DeltaAutoTradeConfig> | null | undefined,
): DeltaAutoTradeConfig {
  const symbols = normalizeSymbols(input)
  const requested = typeof input?.symbol === "string" ? input.symbol.toUpperCase() : ""
  const symbol = isDeltaAutoTradeSymbol(requested) ? requested : symbols[0]

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
    symbol,
    symbols,
    marginPct: normalizeMarginPct(input?.marginPct),
    leverageBySymbol: normalizeLeverageBySymbol(input?.leverageBySymbol),
    lotSizeBySymbol: normalizeLotSizeBySymbol(input?.lotSizeBySymbol),
  }
}

export function getDeltaAutoTradeConfig(
  prefs: DeltaAutoTradePreferences | null | undefined,
  environment: DeltaEnvironment,
): DeltaAutoTradeConfig {
  const raw = environment === "live" ? prefs?.live : prefs?.demo
  return normalizeDeltaAutoTradeConfig(raw)
}
