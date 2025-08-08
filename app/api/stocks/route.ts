import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/app/api/db/mongoose";
import Stock from "../models/Stock"; // Your mongoose model for Stock
import { withAuth } from "@/app/api/middleware/withAuth";

// GET /api/stocks?id=xxx or list with filters & pagination
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  await connectDB();

  const { searchParams } = new URL(request.url);

  // If ?id=xxx is passed, fetch single stock by id
  const id = searchParams.get("id");
  if (id) {
    const stock = await Stock.findOne({ _id: id, userId }).lean();
    if (!stock) {
      return NextResponse.json({ message: "Stock not found" }, { status: 404 });
    }
    return NextResponse.json(stock);
  }

  // Otherwise list with search/filter/pagination
  const query: any = { userId };
  const search = searchParams.get("search")?.trim();
  const expectedDirection = searchParams.get("expectedDirection");
  const sector = searchParams.get("sector");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  if (search) {
    query.$or = [
      { symbol: { $regex: search, $options: "i" } },
      { sector: { $regex: search, $options: "i" } },
      { event: { $regex: search, $options: "i" } },
    ];
  }

  if (expectedDirection && expectedDirection !== "all") {
    query.expectedDirection = expectedDirection;
  }

  if (sector && sector !== "all") {
    query.sector = sector;
  }

  const stocks = await Stock.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Stock.countDocuments(query);

  return NextResponse.json({
    stocks,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/stocks - create stock
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();

    const body = await request.json();

    // Basic validation
    if (
      !body.symbol ||
      !body.sector ||
      !body.expectedDirection ||
      !body.resultDate
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const stock = new Stock({
      ...body,
      userId,
      createdAt: new Date(),
    });

    await stock.save();

    return NextResponse.json(
      { message: "Stock created successfully", stock: stock.toObject() },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error creating stock:", error);
    return NextResponse.json(
      { message: "Failed to create stock", error: error.message || "Error" },
      { status: 500 }
    );
  }
});

// PUT /api/stocks?id=xx - update stock
export const PUT = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  try {
    await connectDB();
const { searchParams } = new URL(request.url);
    const stockId =searchParams.get("id");
    const body = await request.json();

    if (
      !body.symbol ||
      !body.sector ||
      !body.expectedDirection ||
      !body.resultDate
    ) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    const updatedStock = await Stock.findOneAndUpdate(
      { _id: stockId, userId },
      { ...body },
      { new: true }
    );

    if (!updatedStock) {
      return NextResponse.json({ message: "Stock not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ message: "Stock updated", stock: updatedStock.toObject() });
  } catch (error: any) {
    console.error("Error updating stock:", error);
    return NextResponse.json(
      { message: "Failed to update stock", error: error.message || "Error" },
      { status: 500 }
    );
  }
});

// DELETE /api/stocks/:id - delete stock
export const DELETE = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  try {
    await connectDB();

    const stockId = params.id;

    const deleted = await Stock.findOneAndDelete({ _id: stockId, userId });

    if (!deleted) {
      return NextResponse.json({ message: "Stock not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ message: "Stock deleted successfully" });
  } catch (error: any) {
    console.error("Error deleting stock:", error);
    return NextResponse.json(
      { message: "Failed to delete stock", error: error.message || "Error" },
      { status: 500 }
    );
  }
});
