const LEVEL_NUMBER = "[0-9]{1,3}(?:,[0-9]{3})+(?:\\.[0-9]+)?|[0-9]+(?:\\.[0-9]+)?"
const LEVEL_SEP = "[\\s|·,/:–-]*"

function toLevelNumber(raw?: string) {
  if (!raw) return undefined
  const value = Number(raw.replace(/,/g, ""))
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function finiteLevel(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined
}

/** Drop TP/SL tokens from the signal label — those prices live in their own columns. */
export function stripSignalLevelText(signal?: string | null) {
  return (signal || "")
    .replace(new RegExp(`${LEVEL_SEP}(?:take\\s*profit|stop\\s*loss|TP\\s*/\\s*SL|SL\\s*/\\s*TP)\\s*:?\\s*(?:${LEVEL_NUMBER})?`, "gi"), " ")
    .replace(new RegExp(`${LEVEL_SEP}(?:\\bTP\\b|\\bSL\\b)\\s*:?\\s*(?:${LEVEL_NUMBER})?`, "gi"), " ")
    .replace(/[|·]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** One label only — joining entry+exit used to save `Long LONG Long` / `LONG LONG Open`. */
export function normalizeSignalLabel(signal?: string | null) {
  const tokens = stripSignalLevelText(signal)
    .split(/\s+/)
    .filter((token) => token && !/^open$/i.test(token))

  const seen = new Set<string>()
  const kept: string[] = []
  for (const token of tokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    if (key === "long") kept.push("Long")
    else if (key === "short") kept.push("Short")
    else kept.push(token)
  }
  return kept.join(" ") || undefined
}

/** Parse TP/SL prices out of TradingView signal text, e.g. `SHORT | TP: 4386.75 | SL: 4423.42`. */
export function parseSignalLevels(signal?: string | null) {
  const text = (signal || "").trim()
  const tpMatch = text.match(new RegExp(`\\b(?:TP|take\\s*profit)\\s*:?\\s*(${LEVEL_NUMBER})`, "i"))
  const slMatch = text.match(new RegExp(`\\b(?:SL|stop(?:\\s*loss)?)\\s*:?\\s*(${LEVEL_NUMBER})`, "i"))

  return {
    takeProfit: toLevelNumber(tpMatch?.[1]),
    stopLoss: toLevelNumber(slMatch?.[1]),
    label: normalizeSignalLabel(text),
  }
}

export type TradeLevelFields = {
  signal?: string | null
  tags?: string[] | null
  stop_loss?: number | null
  target?: number | null
}

/** Extract TP/SL first from the raw signal/tags, then return a clean signal + numeric levels. */
export function extractTradeLevelFields<T extends TradeLevelFields>(trade: T): T & {
  signal?: string
  stop_loss?: number
  target?: number
} {
  const blob = [trade.signal, ...(trade.tags || [])].filter(Boolean).join(" | ")
  const parsed = parseSignalLevels(blob)
  const stopLoss = finiteLevel(trade.stop_loss) ?? parsed.stopLoss
  const takeProfit = finiteLevel(trade.target) ?? parsed.takeProfit
  const signal = normalizeSignalLabel(trade.signal) || parsed.label || undefined

  return {
    ...trade,
    signal,
    stop_loss: stopLoss,
    target: takeProfit,
  }
}

export function resolveTradeLevels(trade: TradeLevelFields) {
  const extracted = extractTradeLevelFields(trade)
  return {
    stopLoss: extracted.stop_loss,
    takeProfit: extracted.target,
    label: extracted.signal,
  }
}
