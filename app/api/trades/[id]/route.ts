

import { NextRequest, NextResponse } from "next/server";
import connectDB from "../../db/mongoose";
import Trade from "../../models/Trade";
import { withAuth } from "../../middleware/withAuth"; // adjust path accordingly

export const GET = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  await connectDB();
  try {
    const trade = await Trade.findOne({ _id: params.id, userId }).lean();
    if (!trade) return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    return NextResponse.json({
      ...trade,
      id: trade._id?.toString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const PUT = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  await connectDB();
  try {
    const body = await request.json();

    const net_pnl =
      body.exit_price && body.entry_price && body.quantity
        ? (body.trade_type === "Buy"
            ? body.exit_price - body.entry_price
            : body.entry_price - body.exit_price) * body.quantity
        : null;

    const updated = await Trade.findOneAndUpdate(
      { _id: params.id, userId },
      {
        ...body,
        net_pnl,
        entry_date: body.entry_date ? new Date(body.entry_date) : null,
        exit_date: body.exit_date ? new Date(body.exit_date) : null,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updated) return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 });

    return NextResponse.json({
      ...updated.toObject(),
      id: updated._id.toString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

export const DELETE = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  await connectDB();
  try {
    const deleted = await Trade.findOneAndDelete({ _id: params.id, userId });
    if (!deleted) return NextResponse.json({ error: "Trade not found or unauthorized" }, { status: 404 });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
