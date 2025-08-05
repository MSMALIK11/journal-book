import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  await connectDB()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const trade = await Trade.findOne({ _id: params.id, userId: payload.userId }).lean()
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

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  await connectDB()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await request.json()

    const net_pnl =
      body.exit_price && body.entry_price && body.quantity
        ? (body.trade_type === "Buy"
            ? body.exit_price - body.entry_price
            : body.entry_price - body.exit_price) * body.quantity
        : null

    const updated = await Trade.findOneAndUpdate(
      { _id: params.id, userId: payload.userId },
      {
        ...body,
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  await connectDB()
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const deleted = await Trade.findOneAndDelete({ _id: params.id, userId: payload.userId })
    if (!deleted) return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
