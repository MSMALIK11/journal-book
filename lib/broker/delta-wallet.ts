function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "").trim()
    if (!cleaned) return undefined
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function assetSymbolFromRow(row: Record<string, unknown>): string {
  const raw =
    row.asset_symbol ??
    row.symbol ??
    row.currency ??
    row.asset ??
    row.settling_asset ??
    ""
  return typeof raw === "string" ? raw.trim().toUpperCase() : ""
}

function isUsdLikeAsset(symbol: string): boolean {
  if (!symbol) return false
  if (symbol === "USD" || symbol === "USDT" || symbol === "USDC" || symbol === "BUSD" || symbol === "DAI") {
    return true
  }
  return symbol.endsWith("USD")
}

function rowAvailableUsd(row: Record<string, unknown>): { available?: number; total?: number } {
  const balance = toNumber(row.balance ?? row.total_balance)
  const blocked = toNumber(row.blocked_margin ?? row.portfolio_margin)
  let available = toNumber(
    row.available_balance ?? row.available_balance_for_robo ?? row.available_margin,
  )

  if ((available == null || available <= 0) && balance != null && blocked != null) {
    available = Math.max(0, balance - blocked)
  }
  if ((available == null || available <= 0) && balance != null && balance > 0) {
    available = balance
  }

  return { available, total: balance ?? available }
}

export type DeltaWalletSummary = {
  availableMarginUsd: number
  totalBalanceUsd?: number
  asset?: string
}

function normalizeDeltaWalletRows(
  rows: unknown[],
  meta?: unknown,
): DeltaWalletSummary | null {
  let usdAvailable = 0
  let usdTotal: number | undefined
  let bestAvailable = 0
  let bestTotal: number | undefined
  let bestAsset: string | undefined

  for (const item of rows) {
    if (!item || typeof item !== "object") continue
    const row = item as Record<string, unknown>
    const symbol = assetSymbolFromRow(row)
    const { available, total } = rowAvailableUsd(row)

    if (available != null && available > 0) {
      if (!symbol || isUsdLikeAsset(symbol)) {
        usdAvailable = Math.max(usdAvailable, available)
        if (total != null) usdTotal = Math.max(usdTotal ?? 0, total)
      }
      if (available > bestAvailable) {
        bestAvailable = available
        bestTotal = total ?? available
        bestAsset = symbol || undefined
      }
    }
  }

  if (usdAvailable > 0) {
    return { availableMarginUsd: usdAvailable, totalBalanceUsd: usdTotal, asset: "USD" }
  }

  if (usdTotal != null && usdTotal > 0) {
    return { availableMarginUsd: usdTotal, totalBalanceUsd: usdTotal, asset: "USD" }
  }

  const metaEquity =
    meta && typeof meta === "object"
      ? toNumber((meta as Record<string, unknown>).net_equity ?? (meta as Record<string, unknown>).robo_trading_equity)
      : undefined
  if (metaEquity != null && metaEquity > 0) {
    return { availableMarginUsd: metaEquity, totalBalanceUsd: metaEquity, asset: "USD" }
  }

  if (bestAvailable > 0) {
    return {
      availableMarginUsd: bestAvailable,
      totalBalanceUsd: bestTotal,
      asset: bestAsset,
    }
  }

  return null
}

/** Accepts Delta wallet API envelope `{ result, meta }` or a bare balances array. */
export function normalizeDeltaWallet(raw: unknown): DeltaWalletSummary | null {
  if (Array.isArray(raw)) return normalizeDeltaWalletRows(raw, undefined)
  if (!raw || typeof raw !== "object") return null

  const envelope = raw as Record<string, unknown>
  if (Array.isArray(envelope.result)) {
    return normalizeDeltaWalletRows(envelope.result, envelope.meta)
  }

  return null
}
