export type AssetType = "forex" | "metal" | "commodity" | "crypto" | "index" | "stock"
export type QuantityMode = "lots" | "units"

export interface InstrumentSpec {
  symbol: string
  name: string
  assetType: AssetType
  baseCurrency: string
  quoteCurrency: string
  contractSize: number
  pipSize: number
  tickSize: number
  tickValue: number
  decimalPlaces: number
  minLot: number
  maxLot: number
  lotStep: number
}

export type InstrumentSpecification = InstrumentSpec & { isDefault: boolean }

export function getQuantityMode(assetType: AssetType): QuantityMode {
  return ["forex", "metal", "commodity"].includes(assetType) ? "lots" : "units"
}

export const ASSET_TYPE_DEFAULTS: Record<
  AssetType,
  Omit<InstrumentSpec, "symbol" | "name">
> = {
  forex: {
    assetType: "forex",
    baseCurrency: "EUR",
    quoteCurrency: "USD",
    contractSize: 100000,
    tickSize: 0.00001,
    tickValue: 10,
    pipSize: 0.0001,
    decimalPlaces: 5,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
  },
  metal: {
    assetType: "metal",
    baseCurrency: "XAU",
    quoteCurrency: "USD",
    contractSize: 100,
    tickSize: 0.01,
    tickValue: 1,
    pipSize: 0.01,
    decimalPlaces: 2,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
  },
  commodity: {
    assetType: "commodity",
    baseCurrency: "USOIL",
    quoteCurrency: "USD",
    contractSize: 1000,
    tickSize: 0.01,
    tickValue: 10,
    pipSize: 0.01,
    decimalPlaces: 2,
    minLot: 0.01,
    maxLot: 100,
    lotStep: 0.01,
  },
  crypto: {
    assetType: "crypto",
    baseCurrency: "BTC",
    quoteCurrency: "USD",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 1,
    decimalPlaces: 2,
    minLot: 0.00001,
    maxLot: 1000000,
    lotStep: 0.00001,
  },
  index: {
    assetType: "index",
    baseCurrency: "US30",
    quoteCurrency: "USD",
    contractSize: 1,
    tickSize: 1,
    tickValue: 1,
    pipSize: 1,
    decimalPlaces: 1,
    minLot: 0.01,
    maxLot: 100000,
    lotStep: 0.01,
  },
  stock: {
    assetType: "stock",
    baseCurrency: "AAPL",
    quoteCurrency: "USD",
    contractSize: 1,
    tickSize: 0.01,
    tickValue: 0.01,
    pipSize: 0.01,
    decimalPlaces: 2,
    minLot: 1,
    maxLot: 1000000,
    lotStep: 1,
  },
}

export const INSTRUMENTS: Record<string, InstrumentSpecification> = {
  EURUSD: {
    symbol: "EURUSD", name: "Euro / US Dollar", assetType: "forex",
    baseCurrency: "EUR", quoteCurrency: "USD", contractSize: 100000,
    pipSize: 0.0001, tickSize: 0.00001, tickValue: 10, decimalPlaces: 5,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  GBPUSD: {
    symbol: "GBPUSD", name: "British Pound / US Dollar", assetType: "forex",
    baseCurrency: "GBP", quoteCurrency: "USD", contractSize: 100000,
    pipSize: 0.0001, tickSize: 0.00001, tickValue: 10, decimalPlaces: 5,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  USDJPY: {
    symbol: "USDJPY", name: "US Dollar / Japanese Yen", assetType: "forex",
    baseCurrency: "USD", quoteCurrency: "JPY", contractSize: 100000,
    pipSize: 0.01, tickSize: 0.001, tickValue: 1000, decimalPlaces: 3,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  XAUUSD: {
    symbol: "XAUUSD", name: "Gold", assetType: "metal",
    baseCurrency: "XAU", quoteCurrency: "USD", contractSize: 100,
    pipSize: 0.01, tickSize: 0.01, tickValue: 1, decimalPlaces: 2,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  XAGUSD: {
    symbol: "XAGUSD", name: "Silver", assetType: "metal",
    baseCurrency: "XAG", quoteCurrency: "USD", contractSize: 5000,
    pipSize: 0.01, tickSize: 0.01, tickValue: 50, decimalPlaces: 3,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  BTCUSD: {
    symbol: "BTCUSD", name: "Bitcoin", assetType: "crypto",
    baseCurrency: "BTC", quoteCurrency: "USD", contractSize: 1,
    pipSize: 1, tickSize: 0.01, tickValue: 0.01, decimalPlaces: 2,
    minLot: 0.00001, maxLot: 1000000, lotStep: 0.00001, isDefault: true,
  },
  ETHUSD: {
    symbol: "ETHUSD", name: "Ethereum", assetType: "crypto",
    baseCurrency: "ETH", quoteCurrency: "USD", contractSize: 1,
    pipSize: 0.01, tickSize: 0.01, tickValue: 0.01, decimalPlaces: 2,
    minLot: 0.00001, maxLot: 1000000, lotStep: 0.00001, isDefault: true,
  },
  SOLUSD: {
    symbol: "SOLUSD", name: "Solana", assetType: "crypto",
    baseCurrency: "SOL", quoteCurrency: "USD", contractSize: 1,
    pipSize: 0.01, tickSize: 0.001, tickValue: 0.001, decimalPlaces: 3,
    minLot: 0.001, maxLot: 1000000, lotStep: 0.001, isDefault: true,
  },
  USOIL: {
    symbol: "USOIL", name: "US Oil", assetType: "commodity",
    baseCurrency: "USOIL", quoteCurrency: "USD", contractSize: 1000,
    pipSize: 0.01, tickSize: 0.01, tickValue: 10, decimalPlaces: 2,
    minLot: 0.01, maxLot: 100, lotStep: 0.01, isDefault: true,
  },
  US30: {
    symbol: "US30", name: "Dow Jones 30", assetType: "index",
    baseCurrency: "US30", quoteCurrency: "USD", contractSize: 1,
    pipSize: 1, tickSize: 1, tickValue: 1, decimalPlaces: 1,
    minLot: 0.01, maxLot: 100000, lotStep: 0.01, isDefault: true,
  },
  AAPL: {
    symbol: "AAPL", name: "Apple", assetType: "stock",
    baseCurrency: "AAPL", quoteCurrency: "USD", contractSize: 1,
    pipSize: 0.01, tickSize: 0.01, tickValue: 0.01, decimalPlaces: 2,
    minLot: 1, maxLot: 1000000, lotStep: 1, isDefault: true,
  },
}

export const INSTRUMENT_LIST = Object.values(INSTRUMENTS)

export function normalizeInstrumentSpec(
  instrument: Partial<InstrumentSpec> &
    Pick<InstrumentSpec, "symbol" | "name" | "assetType">,
): InstrumentSpec {
  const configured = INSTRUMENTS[instrument.symbol]
  const fallback = configured ?? {
    symbol: instrument.symbol,
    name: instrument.name,
    ...ASSET_TYPE_DEFAULTS[instrument.assetType],
  }

  return {
    symbol: instrument.symbol,
    name: instrument.name,
    assetType: instrument.assetType,
    baseCurrency: instrument.baseCurrency ?? fallback.baseCurrency,
    quoteCurrency: instrument.quoteCurrency ?? fallback.quoteCurrency,
    contractSize: instrument.contractSize ?? fallback.contractSize,
    pipSize: instrument.pipSize ?? fallback.pipSize,
    tickSize: instrument.tickSize ?? fallback.tickSize,
    tickValue: instrument.tickValue ?? fallback.tickValue,
    decimalPlaces: instrument.decimalPlaces ?? fallback.decimalPlaces,
    minLot: instrument.minLot ?? fallback.minLot,
    maxLot: instrument.maxLot ?? fallback.maxLot,
    lotStep: instrument.lotStep ?? fallback.lotStep,
  }
}
