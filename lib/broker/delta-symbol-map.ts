import {
  isDeltaAutoTradeSymbol,
  type DeltaAutoTradeSymbol,
} from "@/lib/delta/auto-trade-settings"

function canonicalizeInstrument(instrument: string): string {
  return instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
}

const TV_TO_DELTA: Record<string, DeltaAutoTradeSymbol> = {
  BTCUSD: "BTCUSD",
  BTCUSDT: "BTCUSD",
  BTC: "BTCUSD",
  ETHUSD: "ETHUSD",
  ETHUSDT: "ETHUSD",
  ETH: "ETHUSD",
  SOLUSD: "SOLUSD",
  SOLUSDT: "SOLUSD",
  SOL: "SOLUSD",
  XAUUSD: "XAUTUSD",
  XAUUSDT: "XAUTUSD",
  XAU: "XAUTUSD",
  GOLD: "XAUTUSD",
  XAUT: "XAUTUSD",
  XAUTUSD: "XAUTUSD",
}

export function mapTvInstrumentToDelta(instrument: string): DeltaAutoTradeSymbol | null {
  const key = canonicalizeInstrument(instrument)
  return TV_TO_DELTA[key] ?? null
}

export function isEnabledAutoTradeSymbol(
  symbols: readonly string[],
  mapped: DeltaAutoTradeSymbol,
): boolean {
  return symbols.some((s) => isDeltaAutoTradeSymbol(s) && s === mapped)
}
