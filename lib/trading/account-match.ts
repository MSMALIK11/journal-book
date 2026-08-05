import { INSTRUMENTS } from "@/lib/instruments"
import type { ITradingAccount } from "@/app/api/models/TradingAccount"

/** Normalize "BTC/USDT", "btcusdt.perp" → "BTCUSDT" */
export function normalizeSymbol(instrument: string): string {
  let value = instrument.trim()
  try {
    value = decodeURIComponent(value)
  } catch {
    // keep original
  }
  value = value.replace(/%3A/gi, ":")
  if (value.includes(":")) {
    value = value.split(":").pop()?.trim() || value
  }
  let normalized = value.replace(/[^A-Za-z0-9]/g, "").toUpperCase()

  const encodedColon = normalized.match(/3A([A-Z0-9]{3,12})$/i)
  if (encodedColon) return encodedColon[1]

  const suffix = normalized.match(
    /(XAUUSD|XAGUSD|BTCUSDT|BTCUSD|ETHUSDT|ETHUSD|SOLUSDT|USOIL|UKOIL|EURUSD|GBPUSD|USDJPY)$/i,
  )
  if (suffix && normalized.length > suffix[1].length + 2) {
    return suffix[1]
  }

  return normalized
}

/** Normalize TradingView oil/crude variants to USOIL. */
export function canonicalInstrumentSymbol(instrument: string): string {
  const normalized = normalizeSymbol(instrument)
  if (!normalized) return normalized

  if (
    normalized === "USOIL" ||
    normalized === "UKOIL" ||
    normalized === "WTI" ||
    normalized === "CRUDE" ||
    normalized === "CRUDEOIL" ||
    normalized === "OIL" ||
    /^CL\d*$/.test(normalized) ||
    normalized.startsWith("WTICRUDE") ||
    (normalized.startsWith("WTI") && !normalized.startsWith("WTICO"))
  ) {
    return "USOIL"
  }

  return normalized
}

function symbolMatches(accountSymbol: string, normalizedInstrument: string): boolean {
  const sym = normalizeSymbol(accountSymbol)
  if (!sym) return false
  if (normalizedInstrument === sym) return true
  if (normalizedInstrument.startsWith(sym) || sym.startsWith(normalizedInstrument)) return true
  return false
}

/** TradingView often uses XAUUSD while accounts are named "Gold". */
const SYMBOL_ALIASES: Record<string, string[]> = {
  GOLD: ["GOLD", "XAU", "XAUUSD", "XAUUSDT"],
  XAU: ["XAU", "XAUUSD", "XAUUSDT", "GOLD"],
  XAUUSD: ["XAUUSD", "XAUUSDT", "XAU", "GOLD"],
  SILVER: ["SILVER", "XAG", "XAGUSD"],
  XAG: ["XAG", "XAGUSD", "SILVER"],
  BTC: ["BTC", "BTCUSDT", "BTCUSD", "BTCUSDC"],
  BTCUSDT: ["BTCUSDT", "BTCUSD", "BTC", "BTCUSDC"],
  BTCUSD: ["BTCUSD", "BTCUSDT", "BTC", "BTCUSDC"],
  ETH: ["ETH", "ETHUSDT", "ETHUSD"],
  ETHUSDT: ["ETHUSDT", "ETHUSD", "ETH"],
  USOIL: ["USOIL", "WTI", "CRUDE", "CRUDEOIL", "OIL", "CL", "UKOIL"],
  WTI: ["WTI", "USOIL", "CRUDE", "CRUDEOIL", "OIL"],
  CRUDE: ["CRUDE", "USOIL", "WTI", "CRUDEOIL", "OIL"],
  OIL: ["OIL", "USOIL", "WTI", "CRUDE"],
}

function expandSymbolAliases(symbols: string[]): string[] {
  const result = new Set<string>()
  for (const sym of symbols) {
    const normalized = normalizeSymbol(sym)
    if (!normalized) continue
    result.add(normalized)
    const aliases = SYMBOL_ALIASES[normalized]
    if (aliases) {
      for (const alias of aliases) {
        const expanded = normalizeSymbol(alias)
        if (expanded) result.add(expanded)
      }
    }
  }
  return [...result]
}

type AccountLike = Pick<ITradingAccount, "_id" | "name" | "symbols" | "isDefault">

/** Symbols from explicit list + account name tokens (e.g. "BTC Backtest" matches BTCUSDT). */
export function getEffectiveSymbols(account: AccountLike): string[] {
  const symbols = normalizeSymbolList(account.symbols || [])
  const seen = new Set(symbols)

  function addToken(token: string) {
    const normalized = normalizeSymbol(token)
    if (
      normalized &&
      normalized !== "MAIN" &&
      normalized !== "US" &&
      normalized.length >= 2 &&
      !seen.has(normalized)
    ) {
      seen.add(normalized)
      symbols.push(normalized)
    }
  }

  addToken(account.name || "")
  for (const part of (account.name || "").split(/[\s\-_/]+/)) {
    addToken(part)
  }

  return expandSymbolAliases(symbols)
}

/** Find an existing non-default account for this symbol, or null. */
export function findAccountForInstrument(
  accounts: AccountLike[],
  instrument: string,
): AccountLike | null {
  const normalized = canonicalInstrumentSymbol(instrument)
  if (!normalized) return null

  const matches: { account: AccountLike; symbolLen: number }[] = []

  for (const account of accounts) {
    if (account.isDefault) continue
    for (const sym of getEffectiveSymbols(account)) {
      if (symbolMatches(sym, normalized)) {
        matches.push({ account, symbolLen: normalizeSymbol(sym).length })
      }
    }
  }

  if (!matches.length) return null

  matches.sort((a, b) => b.symbolLen - a.symbolLen)
  const bestLen = matches[0].symbolLen
  const best = matches.filter((m) => m.symbolLen === bestLen)
  return best[0]?.account ?? null
}

/** Auto-account name — use ticker symbol (USOIL, XAUUSD) so it matches TradingView. */
export function accountNameForInstrument(instrument: string): string {
  const normalized = canonicalInstrumentSymbol(instrument)
  const spec = INSTRUMENTS[normalized]
  if (spec) return spec.symbol
  const base = normalized.replace(/(USDT|USDC|USD|PERP)$/i, "")
  return base || normalized
}

/** True when a non-default account already owns this symbol. */
export function hasDedicatedAccount(accounts: AccountLike[], instrument: string): boolean {
  return findAccountForInstrument(accounts, instrument) != null
}

/** Match order: dedicated account → default account when none/multiple tie. */
export function resolveAccountForInstrument(
  accounts: AccountLike[],
  instrument: string,
): AccountLike {
  const dedicated = findAccountForInstrument(accounts, instrument)
  if (dedicated) return dedicated

  const normalized = canonicalInstrumentSymbol(instrument)
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
