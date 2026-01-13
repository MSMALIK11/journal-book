import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/app/api/db/mongoose";
import Trade from "@/app/api/models/Trade";
import { withAuth } from "@/app/api/middleware/withAuth";

export const GET = withAuth(async (request: NextRequest,userId:string) => {
  await connectDB();
  const { searchParams } = new URL(request.url);
  const query: any = { userId };

  const search = searchParams.get("search");
  const type = searchParams.get("type") || "all";
  const strategy = searchParams.get("strategy");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  if (search) {
    query.$or = [
      { instrument: { $regex: search, $options: "i" } },
      { strategy: { $regex: search, $options: "i" } },
    ];
  }

  if (type === "profit") query.net_pnl = { $gt: 0 };
  if (type === "loss") query.net_pnl = { $lt: 0 };
  if (strategy && strategy !== "all") query.strategy = strategy;

  const trades = await Trade.find(query)
    .sort({ entry_date: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Trade.countDocuments(query);

  const formatted = trades.map((t) => ({
    ...t,
    id: t._id.toString(),
    entry_date: t.entry_date?.toISOString().split("T")[0],
    exit_date: t.exit_date?.toISOString().split("T")[0] || null,
  }));

  return NextResponse.json({
    trades: formatted,
    total,
    totalPages: Math.ceil(total / limit),
  });
});


export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();

    console.log("userId", userId);
    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    // Basic validation
    if (
      !body.entry_date ||
      !body.entry_price ||
      !body.quantity ||
      !body.trade_type ||
      body.net_pnl === undefined
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create new trade without recalculating net_pnl
    const trade = new Trade({
      ...body,
      userId,
      entry_date: new Date(body.entry_date),
      exit_date: body.exit_date ? new Date(body.exit_date) : undefined,
    });

    await trade.save();

    return NextResponse.json(
      {
        message: "Trade created successfully",
        trade: {
          ...trade.toObject(),
          id: trade._id.toString(),
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating trade:", error);
    return NextResponse.json(
      {
        message: "Failed to create trade",
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
});


export const PUT = withAuth(async (request: NextRequest, userId: string,context: any ) => {
  try {
    await connectDB();

    if (!userId) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { params } = await context; 
    const tradeId = params.id;
    const body = await request.json();
console.log("body", body);
    // Basic validation (you can adjust required fields here)
    if (
      !body.entry_date ||
      !body.entry_price ||
      !body.quantity ||
      !body.trade_type
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find and update the trade if it belongs to the user
    const updatedTrade = await Trade.findOneAndUpdate(
      { _id: tradeId, userId },
      {
        ...body,
        entry_date: new Date(body.entry_date),
        exit_date: body.exit_date ? new Date(body.exit_date) : undefined,
      },
      { new: true }
    );

    if (!updatedTrade) {
      return NextResponse.json({ message: "Trade not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: "Trade updated successfully",
        trade: {
          ...updatedTrade.toObject(),
          id: updatedTrade._id.toString(),
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error updating trade:", error);
    return NextResponse.json(
      {
        message: "Failed to update trade",
        error: error.message || "Internal server error",
      },
      { status: 500 }
    );
  }
});
