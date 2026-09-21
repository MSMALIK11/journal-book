export type BracketSide = "long" | "short"

export function isLongTradeType(tradeType: string): boolean {
  const normalized = tradeType.trim().toLowerCase()
  return normalized === "buy" || normalized === "long"
}

export function tradeTypeToBracketSide(tradeType: string): BracketSide {
  return isLongTradeType(tradeType) ? "long" : "short"
}

function roundToTick(price: number, tickSize?: number): number {
  if (!tickSize || tickSize <= 0 || !Number.isFinite(tickSize)) return price
  return Math.round(price / tickSize) * tickSize
}

export type DeltaBracketLevelsInput = {
  tradeType: string
  tvEntry: number
  tvSl?: number | null
  tvTp?: number | null
  deltaAnchor: number
  tickSize?: number
}

export type DeltaBracketLevelsResult = {
  stopLoss?: number
  takeProfit?: number
  slDistance?: number
  tpDistance?: number
  skippedReason?: string
}

export function computeDeltaBracketLevels(input: DeltaBracketLevelsInput): DeltaBracketLevelsResult {
  const side = tradeTypeToBracketSide(input.tradeType)
  const { tvEntry, deltaAnchor } = input
  const skipped: string[] = []

  if (!Number.isFinite(tvEntry) || tvEntry <= 0) return { skippedReason: "invalid_tv_entry" }
  if (!Number.isFinite(deltaAnchor) || deltaAnchor <= 0) return { skippedReason: "invalid_delta_anchor" }

  const hasSl = typeof input.tvSl === "number" && Number.isFinite(input.tvSl) && input.tvSl > 0
  const hasTp = typeof input.tvTp === "number" && Number.isFinite(input.tvTp) && input.tvTp > 0
  if (!hasSl && !hasTp) return { skippedReason: "missing_tv_levels" }

  let slDistance: number | undefined
  let tpDistance: number | undefined
  let stopLoss: number | undefined
  let takeProfit: number | undefined

  if (side === "long") {
    if (hasSl) {
      slDistance = tvEntry - input.tvSl!
      if (slDistance <= 0) {
        skipped.push("invalid_sl_side_long")
      } else {
        stopLoss = roundToTick(deltaAnchor - slDistance, input.tickSize)
        if (stopLoss >= deltaAnchor) {
          skipped.push("sl_above_entry_long")
          stopLoss = undefined
          slDistance = undefined
        }
      }
    }
    if (hasTp) {
      tpDistance = input.tvTp! - tvEntry
      if (tpDistance <= 0) {
        skipped.push("invalid_tp_side_long")
      } else {
        takeProfit = roundToTick(deltaAnchor + tpDistance, input.tickSize)
        if (takeProfit <= deltaAnchor) {
          skipped.push("tp_below_entry_long")
          takeProfit = undefined
          tpDistance = undefined
        }
      }
    }
  } else {
    if (hasSl) {
      slDistance = input.tvSl! - tvEntry
      if (slDistance <= 0) {
        skipped.push("invalid_sl_side_short")
      } else {
        stopLoss = roundToTick(deltaAnchor + slDistance, input.tickSize)
        if (stopLoss <= deltaAnchor) {
          skipped.push("sl_below_entry_short")
          stopLoss = undefined
          slDistance = undefined
        }
      }
    }
    if (hasTp) {
      tpDistance = tvEntry - input.tvTp!
      if (tpDistance <= 0) {
        skipped.push("invalid_tp_side_short")
      } else {
        takeProfit = roundToTick(deltaAnchor - tpDistance, input.tickSize)
        if (takeProfit >= deltaAnchor) {
          skipped.push("tp_above_entry_short")
          takeProfit = undefined
          tpDistance = undefined
        }
      }
    }
  }

  if (stopLoss == null && takeProfit == null) {
    return { skippedReason: skipped.join("; ") || "no_valid_brackets" }
  }

  return {
    stopLoss,
    takeProfit,
    slDistance,
    tpDistance,
    skippedReason: skipped.length ? skipped.join("; ") : undefined,
  }
}

export function formatBracketPrice(price: number): string {
  const raw = price.toString()
  if (raw.includes("e") || raw.includes("E")) {
    return price.toFixed(8).replace(/\.?0+$/, "")
  }
  return raw
}

export function anchorPriceDiffers(estimate: number, actual: number, tickSize?: number): boolean {
  const threshold =
    tickSize && tickSize > 0 ? tickSize : Math.max(Math.abs(estimate), Math.abs(actual)) * 0.0001
  return Math.abs(estimate - actual) > threshold
}

export function getDeltaTickSize(raw: Record<string, unknown> | null | undefined): number | undefined {
  if (!raw) return undefined
  const tick = Number(raw.tick_size)
  return Number.isFinite(tick) && tick > 0 ? tick : undefined
}

export type DeltaBracketPrices = {
  stopLoss?: number
  takeProfit?: number
}

export function bracketPricesToApiParams(bracket: DeltaBracketPrices): {
  bracket_stop_loss_price?: string
  bracket_take_profit_price?: string
  bracket_stop_trigger_method: "mark_price"
} {
  const params: {
    bracket_stop_loss_price?: string
    bracket_take_profit_price?: string
    bracket_stop_trigger_method: "mark_price"
  } = {
    bracket_stop_trigger_method: "mark_price",
  }
  if (bracket.stopLoss != null) {
    params.bracket_stop_loss_price = formatBracketPrice(bracket.stopLoss)
  }
  if (bracket.takeProfit != null) {
    params.bracket_take_profit_price = formatBracketPrice(bracket.takeProfit)
  }
  return params
}
