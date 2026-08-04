import type { AssetType } from "@/lib/instruments"
import { ASSET_TYPE_DEFAULTS, getQuantityMode, INSTRUMENTS } from "@/lib/instruments"
import {
  buildExternalId,
  parseTradingViewDatetime,
  type TradingViewTradeInput,
} from "@/lib/validations/tradingview-sync"

function resolveInstrumentSpec(instrument: string, assetType: AssetType) {
  const normalized = instrument.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  const configured = INSTRUMENTS[normalized]

  if (configured) {
    return {
      symbol: configured.symbol,
      assetType: configured.assetType,
      baseCurrency: configured.baseCurrency,
      quoteCurrency: configured.quoteCurrency,
      contractSize: configured.contractSize,
      pipSize: configured.pipSize,
      tickSize: configured.tickSize,
      tickValue: configured.tickValue,
      decimalPlaces: configured.decimalPlaces,
      minLot: configured.minLot,
      maxLot: configured.maxLot,
      lotStep: configured.lotStep,
    }
  }

  const defaults = ASSET_TYPE_DEFAULTS[assetType]
  return {
    symbol: normalized || instrument,
    assetType,
    ...defaults,
  }
}

function parseTradingViewDate(value: string) {
  return parseTradingViewDatetime(value)
}

function normalizeTradeDates(entryDate: Date, exitDate?: Date) {
  if (!exitDate || exitDate.getTime() >= entryDate.getTime()) {
    return { entry_date: entryDate, exit_date: exitDate }
  }
  return { entry_date: exitDate, exit_date: entryDate }
}

export function mapTradingViewTrade(trade: TradingViewTradeInput, userId: string, accountId: string) {
  const instrument = resolveInstrumentSpec(trade.instrument, trade.assetType)
  const external_id = buildExternalId(
    trade.strategy,
    trade.instrument,
    trade.entry.datetime,
    trade.direction,
    trade.tradeNumber,
  )
  const tags = [trade.entry.signal, trade.exit?.signal].filter(Boolean) as string[]

  const entryDate = parseTradingViewDate(trade.entry.datetime)
  const exitDate = trade.exit ? parseTradingViewDate(trade.exit.datetime) : undefined
  const { entry_date, exit_date } = normalizeTradeDates(entryDate, exitDate)

  return {
    userId,
    accountId,
    instrument: instrument.symbol,
    entry_date,
    exit_date,
    trade_type: trade.direction === "long" ? ("Buy" as const) : ("Sell" as const),
    order_type: "Futures" as const,
    entry_price: trade.entry.price,
    exit_price: trade.exit?.price,
    quantity: trade.entry.size ?? 1,
    asset_type: instrument.assetType,
    quantity_mode: getQuantityMode(instrument.assetType),
    base_currency: instrument.baseCurrency,
    quote_currency: instrument.quoteCurrency,
    contract_size: instrument.contractSize,
    pip_size: instrument.pipSize,
    tick_size: instrument.tickSize,
    tick_value: instrument.tickValue,
    decimal_places: instrument.decimalPlaces,
    min_lot: instrument.minLot,
    max_lot: instrument.maxLot,
    lot_step: instrument.lotStep,
    net_pnl: trade.netPnl,
    return_pct: trade.returnPct,
    commission: trade.commission,
    signal: trade.exit?.signal || trade.entry.signal || undefined,
    strategy: trade.strategy || undefined,
    source: "tradingview" as const,
    external_id,
    tags: tags.length ? [...new Set(tags)] : undefined,
    confidence_rating: 5,
    followed_plan: true,
  }
}
