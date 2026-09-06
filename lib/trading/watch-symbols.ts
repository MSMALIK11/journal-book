import { canonicalInstrumentSymbol } from "@/lib/trading/account-match"

export const MAX_WATCH_SYMBOLS = 5

/** Normalize and dedupe watch symbols for journal + extension. */
export function normalizeWatchSymbols(input: unknown): string[] {
  if (!Array.isArray(input)) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const raw of input) {
    if (typeof raw !== "string") continue
    const symbol = canonicalInstrumentSymbol(raw.trim())
    if (!symbol || seen.has(symbol)) continue
    seen.add(symbol)
    result.push(symbol)
    if (result.length >= MAX_WATCH_SYMBOLS) break
  }

  return result
}
