import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import Trade from "@/app/api/models/Trade"
import { verifyToken } from "@/lib/auth"

export async function GET(request: NextRequest) {
  await connectDB()
  try {
   const token = request.cookies.get("token")?.value

    console.log("Token:", token)
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const payload = verifyToken(token)
    if (!payload) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const query: any = { userId: payload.userId }

    const search = searchParams.get("search")
    const type = searchParams.get("type") || "all"
    const strategy = searchParams.get("strategy")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "10")

    if (search) {
      query.$or = [
        { instrument: { $regex: search, $options: "i" } },
        { strategy: { $regex: search, $options: "i" } },
      ]
    }

    if (type === "profit") query.net_pnl = { $gt: 0 }
    if (type === "loss") query.net_pnl = { $lt: 0 }
    if (strategy && strategy !== "all") query.strategy = strategy

    const trades = await Trade.find(query)
      .sort({ entry_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    const total = await Trade.countDocuments(query)

    const formatted = trades.map((t) => ({
      ...t,
      id: t._id.toString(),
      entry_date: t.entry_date?.toISOString().split("T")[0],
      exit_date: t.exit_date?.toISOString().split("T")[0] || null,
    }))

    return NextResponse.json({
      trades: formatted,
      total,
      totalPages: Math.ceil(total / limit),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  await connectDB()
  try {
   const token = request.cookies.get("token")?.value

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

    const trade = new Trade({
      ...body,
      userId: payload.userId,
      entry_date: new Date(body.entry_date),
      exit_date: body.exit_date ? new Date(body.exit_date) : undefined,
      net_pnl,
    })

    await trade.save()

    return NextResponse.json({
      ...trade.toObject(),
      id: trade._id.toString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}