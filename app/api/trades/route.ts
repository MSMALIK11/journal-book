import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { getQuantityMode } from "@/lib/instruments"
import { resolveInstrumentForUser } from "@/lib/instruments-server"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { calculateProfit } from "@/lib/trading/calculator"
import { tradeSchema } from "@/lib/validations/trade"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await connectDB()

    const { accountId } = await getAccountContext(request, session.sub)
    const { searchParams } = new URL(request.url)
    const query: any = { userId: session.sub, accountId }

    const search = searchParams.get("search")
    const type = searchParams.get("type") || "all"
    const strategy = searchParams.get("strategy")
    const source = searchParams.get("source")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const requestedPage = Number.parseInt(searchParams.get("page") || "1")
    const requestedLimit = Number.parseInt(searchParams.get("limit") || "10")
    const page = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(source === "tradingview" ? 10000 : 1000, Math.max(1, requestedLimit))
      : 10

    if (search) {
      query.$or = [
        { instrument: { $regex: search, $options: "i" } },
        { strategy: { $regex: search, $options: "i" } },
      ]
    }

    if (type === "profit") query.net_pnl = { $gt: 0 }
    if (type === "loss") query.net_pnl = { $lt: 0 }
    if (strategy && strategy !== "all") query.strategy = strategy
    if (source === "tradingview" || source === "manual") query.source = source
    if (startDate || endDate) {
      const datePattern = /^\d{4}-\d{2}-\d{2}$/
      if (
        (startDate && !datePattern.test(startDate)) ||
        (endDate && !datePattern.test(endDate))
      ) {
        return NextResponse.json({ error: "Invalid calendar date range" }, { status: 400 })
      }
      query.entry_date = {}
      if (startDate) query.entry_date.$gte = new Date(`${startDate}T00:00:00.000Z`)
      if (endDate) query.entry_date.$lte = new Date(`${endDate}T23:59:59.999Z`)
    }

    const trades = await Trade.find(query)
      .sort({ entry_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    const total = await Trade.countDocuments(query)

    const formatted = trades.map((t) => ({
      ...t,
      id: t._id.toString(),
      entry_date:
        t.source === "tradingview"
          ? t.entry_date?.toISOString()
          : t.entry_date?.toISOString().split("T")[0],
      exit_date:
        t.source === "tradingview"
          ? t.exit_date?.toISOString() || null
          : t.exit_date?.toISOString().split("T")[0] || null,
    }))

    return NextResponse.json({
      trades: formatted,
      total,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error) {
    console.error("Failed to load trades:", error)
    return NextResponse.json({ error: "Unable to load trades" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await connectDB()
    const { accountId } = await getAccountContext(request, session.sub)
    const body = await request.json()
    const parsed = tradeSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Please correct the highlighted fields",
          fields: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      )
    }

    const data = parsed.data
    const instrument = await resolveInstrumentForUser(session.sub, data.instrument)

    if (!instrument) {
      return NextResponse.json(
        { error: "Instrument specifications were not found. Select a valid instrument." },
        { status: 400 },
      )
    }
    const sizeSteps = (data.quantity - instrument.minLot) / instrument.lotStep
    if (
      data.quantity < instrument.minLot ||
      data.quantity > instrument.maxLot ||
      Math.abs(sizeSteps - Math.round(sizeSteps)) > 0.000001
    ) {
      return NextResponse.json(
        {
          error: `Size must be between ${instrument.minLot} and ${instrument.maxLot} in steps of ${instrument.lotStep}.`,
          fields: { quantity: ["Size does not match the broker specification."] },
        },
        { status: 400 },
      )
    }

    const net_pnl = calculateProfit({
      entryPrice: data.entry_price,
      exitPrice: data.exit_price,
      size: data.quantity,
      direction: data.trade_type,
      instrument,
    })

    const trade = new Trade({
      ...data,
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
      userId: session.sub,
      accountId,
      source: "manual",
      entry_date: new Date(data.entry_date),
      exit_date: data.exit_date ? new Date(data.exit_date) : undefined,
      strategy: data.strategy || undefined,
      emotion_tag: data.emotion_tag || undefined,
      mistake_tag: data.mistake_tag || undefined,
      setup_notes: data.setup_notes || undefined,
      review_notes: data.review_notes || undefined,
      net_pnl,
    })

    await trade.save()

    return NextResponse.json({
      ...trade.toObject(),
      id: trade._id.toString(),
    })
  } catch (error) {
    console.error("Failed to save trade:", error)
    return NextResponse.json({ error: "Unable to save trade" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const source = new URL(request.url).searchParams.get("source")
    if (source !== "tradingview") {
      return NextResponse.json(
        { error: "Bulk delete requires source=tradingview" },
        { status: 400 },
      )
    }

    await connectDB()
    const { accountId } = await getAccountContext(request, session.sub)

    const result = await Trade.deleteMany({
      userId: session.sub,
      accountId,
      source: "tradingview",
    })

    return NextResponse.json({ deleted: result.deletedCount ?? 0 })
  } catch (error) {
    console.error("Failed to delete synced trades:", error)
    return NextResponse.json({ error: "Unable to delete synced trades" }, { status: 500 })
  }
}