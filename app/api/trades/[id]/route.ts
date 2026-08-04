import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { getQuantityMode } from "@/lib/instruments"
import { resolveInstrumentForUser } from "@/lib/instruments-server"
import { getAccountContext } from "@/lib/active-account"
import { getSession } from "@/lib/session"
import { calculateProfit } from "@/lib/trading/calculator"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await connectDB()
    const { accountId } = await getAccountContext(request, session.sub)

    const trade = await Trade.findOne({ _id: params.id, userId: session.sub, accountId }).lean()
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 })

if (Array.isArray(trade)) {
  return NextResponse.json({ error: "Unexpected array result" }, { status: 500 })
}
return NextResponse.json({
  ...(trade as any),
  id:trade._id &&  trade._id.toString(),
  entry_date: trade.entry_date ? trade.entry_date.toISOString().split("T")[0] : null,
  exit_date: trade.exit_date ? trade.exit_date.toISOString().split("T")[0] : null,
})

  } catch (error) {
    console.error("Failed to load trade:", error)
    return NextResponse.json({ error: "Unable to load trade" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
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
    const instrument = await resolveInstrumentForUser(session.sub, body.instrument)
    if (!instrument) {
      return NextResponse.json(
        { error: "Instrument specifications were not found. Select a valid instrument." },
        { status: 400 },
      )
    }
    const size = Number(body.quantity)
    const entryPrice = Number(body.entry_price)
    const exitPrice = body.exit_price ? Number(body.exit_price) : null
    const sizeSteps = (size - instrument.minLot) / instrument.lotStep
    if (
      !Number.isFinite(size) ||
      size < instrument.minLot ||
      size > instrument.maxLot ||
      Math.abs(sizeSteps - Math.round(sizeSteps)) > 0.000001
    ) {
      return NextResponse.json(
        { error: `Size must match the ${instrument.symbol} broker specification.` },
        { status: 400 },
      )
    }
    if (
      !Number.isFinite(entryPrice) ||
      entryPrice <= 0 ||
      (exitPrice !== null && (!Number.isFinite(exitPrice) || exitPrice <= 0))
    ) {
      return NextResponse.json(
        { error: "Entry and exit prices must be valid positive numbers." },
        { status: 400 },
      )
    }

    const net_pnl = calculateProfit({
      entryPrice,
      exitPrice,
      size,
      direction: body.trade_type,
      instrument,
    })

    const updated = await Trade.findOneAndUpdate(
      { _id: params.id, userId: session.sub, accountId },
      {
        ...body,
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
        net_pnl,
        entry_date: new Date(body.entry_date),
        exit_date: body.exit_date ? new Date(body.exit_date) : null,
        updatedAt: new Date(),
      },
      { new: true },
    )

    if (!updated) return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 })

    return NextResponse.json({
      ...updated.toObject(),
      id: updated._id.toString(),
    })
  } catch (error) {
    console.error("Failed to update trade:", error)
    return NextResponse.json({ error: "Unable to update trade" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    await connectDB()
    const { accountId } = await getAccountContext(request, session.sub)

    const deleted = await Trade.findOneAndDelete({ _id: params.id, userId: session.sub, accountId })
    if (!deleted) return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to delete trade:", error)
    return NextResponse.json({ error: "Unable to delete trade" }, { status: 500 })
  }
}
