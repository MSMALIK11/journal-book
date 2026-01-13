import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/app/api/db/mongoose";
import Strategy from "../models/Strategy"; // Your mongoose model for Strategy
import { withAuth } from "@/app/api/middleware/withAuth";

// GET /api/strategies?id=xxx or list with filters & pagination
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  await connectDB();
  const { searchParams } = new URL(request.url);

  // If ?id=xxx then fetch single
  const id = searchParams.get("id");
  if (id) {
    const strategy = await Strategy.findOne({ _id: id, userId }).lean();
    if (!strategy) {
      return NextResponse.json({ message: "Strategy not found" }, { status: 404 });
    }
    return NextResponse.json(strategy);
  }

  // Otherwise list all
  const query: any = { userId };
  const search = searchParams.get("search")?.trim();
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "10");

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { instrument: { $regex: search, $options: "i" } },
      { notes: { $regex: search, $options: "i" } },
    ];
  }

  const strategies = await Strategy.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();

  const total = await Strategy.countDocuments(query);

  return NextResponse.json({
    strategies,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

// POST /api/strategies - create new strategy
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ message: "Name is required" }, { status: 400 });
    }

    const strategy = new Strategy({
      ...body,
      userId,
      createdAt: new Date(),
    });

    await strategy.save();
    return NextResponse.json({ message: "Strategy created", strategy: strategy.toObject() }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ message: "Failed to create strategy", error: error.message }, { status: 500 });
  }
});

// PUT /api/strategies?id=xxx - update strategy
export const PUT = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const strategyId = searchParams.get("id");
    const body = await request.json();

    if (!strategyId) {
      return NextResponse.json({ message: "Missing strategy ID" }, { status: 400 });
    }

    const updated = await Strategy.findOneAndUpdate(
      { _id: strategyId, userId },
      { ...body },
      { new: true }
    );

    if (!updated) {
      return NextResponse.json({ message: "Strategy not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ message: "Strategy updated", strategy: updated.toObject() });
  } catch (error: any) {
    return NextResponse.json({ message: "Failed to update strategy", error: error.message }, { status: 500 });
  }
});

// DELETE /api/strategies/:id - delete strategy
export const DELETE = withAuth(async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
  try {
    await connectDB();
    const strategyId = params.id;

    const deleted = await Strategy.findOneAndDelete({ _id: strategyId, userId });

    if (!deleted) {
      return NextResponse.json({ message: "Strategy not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ message: "Strategy deleted successfully" });
  } catch (error: any) {
    return NextResponse.json({ message: "Failed to delete strategy", error: error.message }, { status: 500 });
  }
});
