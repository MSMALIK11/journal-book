import type { ITradingAccount } from "@/app/api/models/TradingAccount"

/** Normalize "BTC/USDT", "btcusdt.perp" → "BTCUSDT" */
export function normalizeSymbol(instrument: string): string {
  return instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

function symbolMatches(accountSymbol: string, normalizedInstrument: string): boolean {
  const sym = normalizeSymbol(accountSymbol)
  if (!sym) return false
  if (normalizedInstrument === sym) return true
  if (normalizedInstrument.startsWith(sym) || sym.startsWith(normalizedInstrument)) return true
  return false
}

type AccountLike = Pick<ITradingAccount, "_id" | "name" | "symbols" | "isDefault">

/** Symbols from explicit list + account name (e.g. name "BTC" matches BTCUSDT). */
export function getEffectiveSymbols(account: AccountLike): string[] {
  const symbols = normalizeSymbolList(account.symbols || [])
  const fromName = normalizeSymbol(account.name || "")
  if (
    fromName &&
    fromName !== "MAIN" &&
    fromName.length >= 2 &&
    !symbols.includes(fromName)
  ) {
    symbols.push(fromName)
  }
  return symbols
}

/** Match order: exact symbol → prefix → default account when none/multiple tie. */
export function resolveAccountForInstrument(
  accounts: AccountLike[],
  instrument: string,
): AccountLike {
  const normalized = normalizeSymbol(instrument)
  const defaultAccount =
    accounts.find((a) => a.isDefault) ?? accounts[0]

  if (!accounts.length) {
    throw new Error("No trading accounts configured")
  }

  if (!normalized) {
    return defaultAccount
  }

  const matches: { account: AccountLike; symbolLen: number }[] = []

  for (const account of accounts) {
    for (const sym of getEffectiveSymbols(account)) {
      if (symbolMatches(sym, normalized)) {
        matches.push({ account, symbolLen: normalizeSymbol(sym).length })
      }
    }
  }

  if (matches.length === 0) {
    return defaultAccount
  }

  matches.sort((a, b) => b.symbolLen - a.symbolLen)
  const bestLen = matches[0].symbolLen
  const best = matches.filter((m) => m.symbolLen === bestLen)

  if (best.length === 1) {
    return best[0].account
  }

  return defaultAccount
}

export function normalizeSymbolList(symbols: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const sym of symbols) {
    const normalized = normalizeSymbol(sym)
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized)
      result.push(normalized)
    }
  }
  return result
}
