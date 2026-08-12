import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import Instrument from "@/app/api/models/Instrument"
import { normalizeInstrumentSpec } from "@/lib/instruments"
import { seedDefaultInstruments } from "@/lib/instruments-server"
import { getSession } from "@/lib/session"

const instrumentSchema = z.object({
  symbol: z
    .string()
    .trim()
    .min(2, "Symbol must have at least 2 characters")
    .max(20, "Symbol is too long")
    .regex(/^[A-Za-z0-9._/-]+$/, "Use only letters, numbers, dot, slash, dash, or underscore")
    .transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2, "Display name is required").max(50),
  assetType: z.enum(["forex", "metal", "commodity", "crypto", "index", "stock"]),
  baseCurrency: z.string().trim().min(1).max(20).transform((value) => value.toUpperCase()),
  contractSize: z.coerce.number().positive("Contract size must be greater than 0"),
  tickSize: z.coerce.number().positive("Tick size must be greater than 0"),
  tickValue: z.coerce.number().positive("Tick value must be greater than 0"),
  pipSize: z.coerce.number().positive("Pip size must be greater than 0"),
  quoteCurrency: z.string().trim().min(3).max(10).transform((value) => value.toUpperCase()),
  decimalPlaces: z.coerce.number().int().min(0).max(10),
  minLot: z.coerce.number().positive("Minimum size must be greater than 0"),
  maxLot: z.coerce.number().positive("Maximum size must be greater than 0"),
  lotStep: z.coerce.number().positive("Size step must be greater than 0"),
}).refine((data) => data.maxLot >= data.minLot, {
  message: "Maximum size must be greater than or equal to minimum size",
  path: ["maxLot"],
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    await connectDB()
    await seedDefaultInstruments(session.sub)

    const instruments = await Instrument.find({ userId: session.sub })
      .sort({ isDefault: -1, name: 1 })
      .select("symbol name assetType baseCurrency quoteCurrency contractSize pipSize tickSize tickValue decimalPlaces minLot maxLot lotStep isDefault")
      .lean()

    return NextResponse.json({
      instruments: instruments.map((instrument) => ({
        ...instrument,
        ...normalizeInstrumentSpec({
          ...instrument,
          assetType: instrument.assetType || "crypto",
        }),
      })),
    })
  } catch (error) {
    console.error("Failed to load instruments:", error)
    return NextResponse.json({ error: "Unable to load instruments" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = instrumentSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid instrument" },
      { status: 400 },
    )
  }

  try {
    await connectDB()
    const existing = await Instrument.findOne({
      userId: session.sub,
      symbol: parsed.data.symbol,
    }).select("symbol name assetType baseCurrency quoteCurrency contractSize pipSize tickSize tickValue decimalPlaces minLot maxLot lotStep isDefault")

    if (existing) {
      return NextResponse.json(
        { error: "This symbol already exists in your instrument list." },
        { status: 409 },
      )
    }

    const instrument = await Instrument.create({
      userId: session.sub,
      ...parsed.data,
      isDefault: false,
    })

    return NextResponse.json(
      {
        instrument: {
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
          isDefault: instrument.isDefault,
        },
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("Failed to add instrument:", error)
    return NextResponse.json({ error: "Unable to add this instrument" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = instrumentSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid instrument specification" },
      { status: 400 },
    )
  }

  try {
    await connectDB()
    const instrument = await Instrument.findOneAndUpdate(
      { userId: session.sub, symbol: parsed.data.symbol },
      { $set: parsed.data },
      { returnDocument: "after", runValidators: true },
    ).select("symbol name assetType baseCurrency quoteCurrency contractSize pipSize tickSize tickValue decimalPlaces minLot maxLot lotStep isDefault")

    if (!instrument) {
      return NextResponse.json({ error: "Instrument was not found." }, { status: 404 })
    }
    return NextResponse.json({ instrument })
  } catch (error) {
    console.error("Failed to update instrument:", error)
    return NextResponse.json(
      { error: "Unable to update this instrument specification" },
      { status: 500 },
    )
  }
}
