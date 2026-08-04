import Instrument from "@/app/api/models/Instrument"
import {
  INSTRUMENT_LIST,
  INSTRUMENTS,
  normalizeInstrumentSpec,
  type InstrumentSpec,
} from "@/lib/instruments"

let legacyIndexesDropped = false

async function dropLegacyInstrumentIndexes() {
  if (legacyIndexesDropped) return
  legacyIndexesDropped = true

  try {
    const indexes = await Instrument.collection.indexes()
    for (const index of indexes) {
      const name = index.name
      if (!name || name === "_id_" || name === "userId_1_symbol_1") continue
      if (name.includes("category") || (index.key?.symbol && !index.key?.userId)) {
        await Instrument.collection.dropIndex(name).catch(() => undefined)
      }
    }
  } catch {
    // Ignore index cleanup failures — reads can still proceed.
  }
}

export async function seedDefaultInstruments(userId: string) {
  await dropLegacyInstrumentIndexes()

  try {
    await Instrument.bulkWrite(
      INSTRUMENT_LIST.map((instrument) => ({
        updateOne: {
          filter: { userId, symbol: instrument.symbol },
          update: {
            $setOnInsert: {
              userId,
              symbol: instrument.symbol,
              name: instrument.name,
              assetType: instrument.assetType,
              baseCurrency: instrument.baseCurrency,
              contractSize: instrument.contractSize,
              tickSize: instrument.tickSize,
              tickValue: instrument.tickValue,
              pipSize: instrument.pipSize,
              quoteCurrency: instrument.quoteCurrency,
              decimalPlaces: instrument.decimalPlaces,
              minLot: instrument.minLot,
              maxLot: instrument.maxLot,
              lotStep: instrument.lotStep,
              isDefault: true,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    )
  } catch (error) {
    const code = (error as { code?: number })?.code
    if (code !== 11000) throw error
  }
}

export async function resolveInstrumentForUser(
  userId: string,
  symbol: string,
): Promise<InstrumentSpec | null> {
  const normalized = symbol.replace(/[^A-Za-z0-9]/g, "").toUpperCase()
  if (!normalized) return null

  await seedDefaultInstruments(userId)

  const stored = await Instrument.findOne({ userId, symbol: normalized }).lean()
  if (stored) {
    return normalizeInstrumentSpec({
      ...stored,
      assetType: stored.assetType || "crypto",
    })
  }

  const configured = INSTRUMENTS[normalized]
  if (!configured) return null

  return normalizeInstrumentSpec(configured)
}
