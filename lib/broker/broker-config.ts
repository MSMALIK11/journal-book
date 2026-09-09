import { z } from "zod"

export const BROKER_NAMES = ["xm", "other"] as const
export type BrokerName = (typeof BROKER_NAMES)[number]

export const BROKER_PLATFORMS = ["mt5"] as const
export type BrokerPlatform = (typeof BROKER_PLATFORMS)[number]

export const RISK_MODES = ["fixed_lot", "risk_percent"] as const
export type BrokerRiskMode = (typeof RISK_MODES)[number]

export const CONNECTION_STATUSES = [
  "not_connected",
  "connecting",
  "connected",
  "error",
  "unavailable",
] as const
export type BrokerConnectionStatus = (typeof CONNECTION_STATUSES)[number]

export type BrokerSymbolMapping = {
  id: string
  tradingViewSymbol: string
  mt5Symbol: string
  enabled: boolean
}

export type BrokerExecutionPreferences = {
  enabled: boolean
  defaultLot: number
  allowBuy: boolean
  allowSell: boolean
  maxOpenPositions: number
  defaultStopLoss?: number
  defaultTakeProfit?: number
  riskMode: BrokerRiskMode
  mappings: BrokerSymbolMapping[]
}

export type BrokerConnectionPublic = {
  configured: boolean
  hasPassword: boolean
  broker: BrokerName
  platform: BrokerPlatform
  login: string
  loginMasked: string
  server: string
  status: BrokerConnectionStatus
  lastCheckedAt: string | null
  lastMessage: string | null
}

export type BrokerConfigPublic = {
  connection: BrokerConnectionPublic
  execution: BrokerExecutionPreferences
}

export const DEFAULT_EXECUTION: BrokerExecutionPreferences = {
  enabled: false,
  defaultLot: 0.01,
  allowBuy: true,
  allowSell: true,
  maxOpenPositions: 5,
  defaultStopLoss: undefined,
  defaultTakeProfit: undefined,
  riskMode: "fixed_lot",
  mappings: [],
}

export const XM_CREDENTIAL_LABEL = "XM MT5"

export function maskAccountLogin(login: string): string {
  const digits = login.replace(/\D/g, "")
  if (digits.length <= 4) return "****"
  return `****${digits.slice(-4)}`
}

function asFiniteNumber(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSymbolToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
}

export function normalizeMappings(value: unknown): BrokerSymbolMapping[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const rows: BrokerSymbolMapping[] = []
  for (const row of value) {
    if (!row || typeof row !== "object") continue
    const item = row as Record<string, unknown>
    const tradingViewSymbol = normalizeSymbolToken(item.tradingViewSymbol)
    const mt5Symbol = normalizeSymbolToken(item.mt5Symbol)
    if (!tradingViewSymbol || !mt5Symbol) continue
    const key = `${tradingViewSymbol}:${mt5Symbol}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : key,
      tradingViewSymbol,
      mt5Symbol,
      enabled: item.enabled !== false,
    })
  }
  return rows
}

export function normalizeExecutionPreferences(value: unknown): BrokerExecutionPreferences {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const lot = asFiniteNumber(row.defaultLot, DEFAULT_EXECUTION.defaultLot)
  const maxOpen = Math.floor(asFiniteNumber(row.maxOpenPositions, DEFAULT_EXECUTION.maxOpenPositions))
  const sl = row.defaultStopLoss == null || row.defaultStopLoss === "" ? undefined : Number(row.defaultStopLoss)
  const tp =
    row.defaultTakeProfit == null || row.defaultTakeProfit === "" ? undefined : Number(row.defaultTakeProfit)
  const riskMode = RISK_MODES.includes(row.riskMode as BrokerRiskMode)
    ? (row.riskMode as BrokerRiskMode)
    : DEFAULT_EXECUTION.riskMode

  return {
    enabled: row.enabled === true,
    defaultLot: lot > 0 ? lot : DEFAULT_EXECUTION.defaultLot,
    allowBuy: row.allowBuy !== false,
    allowSell: row.allowSell !== false,
    maxOpenPositions: maxOpen >= 1 ? maxOpen : 1,
    defaultStopLoss: sl != null && Number.isFinite(sl) && sl > 0 ? sl : undefined,
    defaultTakeProfit: tp != null && Number.isFinite(tp) && tp > 0 ? tp : undefined,
    riskMode,
    mappings: normalizeMappings(row.mappings),
  }
}

export function applyExecutionEnabled(
  prefs: BrokerExecutionPreferences,
  enabled: boolean,
): BrokerExecutionPreferences {
  return { ...prefs, enabled }
}

const mappingSchema = z.object({
  id: z.string().max(80).optional(),
  tradingViewSymbol: z.string().min(1).max(32),
  mt5Symbol: z.string().min(1).max(32),
  enabled: z.boolean().optional(),
})

export const brokerConfigPutSchema = z.object({
  broker: z.enum(BROKER_NAMES),
  platform: z.enum(BROKER_PLATFORMS),
  login: z.string().regex(/^\d{4,20}$/, "Account login must be numeric"),
  server: z.string().min(2).max(80),
  password: z.string().min(4).max(128).optional(),
  execution: z.object({
    enabled: z.boolean(),
    defaultLot: z.number().positive(),
    allowBuy: z.boolean(),
    allowSell: z.boolean(),
    maxOpenPositions: z.number().int().min(1).max(100),
    defaultStopLoss: z.number().positive().nullish(),
    defaultTakeProfit: z.number().positive().nullish(),
    riskMode: z.enum(RISK_MODES),
    mappings: z.array(mappingSchema).max(50),
  }),
})

export const brokerTestConnectionSchema = z.object({
  login: z.string().regex(/^\d{4,20}$/).optional(),
  server: z.string().min(2).max(80).optional(),
  password: z.string().min(4).max(128).optional(),
})
