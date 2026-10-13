/** Normalize TradingView chart.resolution() tokens (5, 60, 1D, D, etc.). */
export function normalizeChartInterval(value?: string | null): string | undefined {
  const raw = String(value || "").trim()
  if (!raw) return undefined

  const upper = raw.toUpperCase()
  if (/^\d+$/.test(upper)) return String(Number.parseInt(upper, 10))
  if (upper === "D" || upper === "1D") return "D"
  if (upper === "W" || upper === "1W") return "W"
  if (upper === "M" || upper === "1M" || upper === "MO") return "M"

  const suffixed = upper.match(/^(\d+)(S|H|D|W|M)$/)
  if (suffixed) {
    const n = Number.parseInt(suffixed[1], 10)
    const unit = suffixed[2]
    if (unit === "S") return String(n)
    if (unit === "H") return String(n * 60)
    if (unit === "D") return "D"
    if (unit === "W") return "W"
    if (unit === "M") return "M"
  }

  return upper.slice(0, 16)
}

export function formatChartIntervalLabel(interval?: string | null): string {
  const normalized = normalizeChartInterval(interval)
  if (!normalized) return ""
  if (normalized === "D") return "1D"
  if (normalized === "W") return "1W"
  if (normalized === "M") return "1M"
  const minutes = Number.parseInt(normalized, 10)
  if (Number.isFinite(minutes)) {
    if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}H`
    return `${minutes}m`
  }
  return normalized
}
