export type DeltaPositionRow = {
  symbol: string
  side: "long" | "short" | "flat"
  size: number
  entryPrice?: number
  markPrice?: number
  unrealizedPnl?: number
  productId?: number
}

function toNumber(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function normalizeDeltaPositions(raw: unknown): DeltaPositionRow[] {
  if (!Array.isArray(raw)) return []

  return raw
    .map<DeltaPositionRow | null>((item) => {
      if (!item || typeof item !== "object") return null
      const row = item as Record<string, unknown>
      const size = toNumber(row.size) ?? 0
      if (Math.abs(size) < 1e-12) return null

      const productSymbol =
        typeof row.product_symbol === "string"
          ? row.product_symbol
          : typeof row.symbol === "string"
            ? row.symbol
            : "UNKNOWN"

      const sideRaw = String(row.side ?? (size >= 0 ? "buy" : "sell")).toLowerCase()
      const side: DeltaPositionRow["side"] =
        sideRaw === "sell" || sideRaw === "short" ? "short" : "long"

      return {
        symbol: productSymbol.toUpperCase(),
        side,
        size: Math.abs(size),
        entryPrice: toNumber(row.entry_price ?? row.average_entry_price ?? row.avg_entry_price),
        markPrice: toNumber(row.mark_price ?? row.index_price),
        unrealizedPnl: toNumber(row.unrealized_pnl ?? row.unrealized_funding_pnl),
        productId: toNumber(row.product_id),
      } satisfies DeltaPositionRow
    })
    .filter((row): row is DeltaPositionRow => row != null)
}
