import { z } from "zod"

const tvLegSchema = z.object({
  datetime: z.string().min(1),
  price: z.number().positive(),
  signal: z.string().optional().default(""),
  size: z.number().positive().optional(),
})

export const tradingViewTradeSchema = z.object({
  tradeNumber: z.number().int().positive(),
  direction: z.enum(["long", "short"]),
  instrument: z.string().trim().min(1).max(40),
  strategy: z.string().trim().max(120).optional().default(""),
  entry: tvLegSchema,
  exit: tvLegSchema.optional(),
  netPnl: z.number().optional(),
  returnPct: z.number().optional(),
  commission: z.number().optional(),
  assetType: z
    .enum(["forex", "metal", "commodity", "crypto", "index", "stock"])
    .optional()
    .default("crypto"),
})

export const tradingViewSyncSchema = z.object({
  trades: z.array(tradingViewTradeSchema).min(1).max(10000),
})

export type TradingViewTradeInput = z.infer<typeof tradingViewTradeSchema>

export function normalizeTradingViewDatetime(value: string) {
  let s = String(value).replace(/\s+/g, " ").trim()
  // "Jan 26, 2025, 10:30" → "Jan 26, 2025 10:30"
  s = s.replace(/,\s*(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)/i, " $1")
  return s
}

export function parseTradingViewDatetime(value: string): Date {
  const normalized = normalizeTradingViewDatetime(value)
  const parsed = new Date(normalized)
  if (!Number.isNaN(parsed.getTime())) return parsed

  const dmy = normalized.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s+(\d{1,2}):(\d{2})/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    const fallback = new Date(
      year,
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4]),
      Number(dmy[5]),
    )
    if (!Number.isNaN(fallback.getTime())) return fallback
  }

  throw new Error(`Invalid trade datetime: ${value}`)
}

function strategySlug(strategy: string) {
  return (
    strategy
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "strategy"
  )
}

/** Legacy ID — trade number only (used before v2 dedup). */
export function buildLegacyExternalId(strategy: string, tradeNumber: number) {
  return `tv:${strategySlug(strategy)}:${tradeNumber}`
}

/**
 * Stable ID per unique trade: strategy + instrument + entry time + direction.
 * Re-importing the same trade updates in place; a new backtest with trade #1
 * gets a new row instead of overwriting an older backtest.
 */
export function buildExternalId(
  strategy: string,
  instrument: string,
  entryDatetime: string,
  direction: "long" | "short",
  tradeNumber?: number,
) {
  const slug = strategySlug(strategy)
  const symbol = instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || "UNKNOWN"
  const normalized = normalizeTradingViewDatetime(entryDatetime)
  const entryMs = new Date(normalized).getTime()

  if (Number.isFinite(entryMs) && entryMs > 0) {
    return `tv:${slug}:${symbol}:${entryMs}:${direction}`
  }

  return buildLegacyExternalId(strategy, tradeNumber ?? 0)
}
