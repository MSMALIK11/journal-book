import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/app/api/db/mongoose";
import ContractSize from "@/app/api/models/Instruments";
import { withAuth } from "@/app/api/middleware/withAuth";

// GET - List contract sizes
// export const GET = withAuth(async (request: NextRequest, userId: string) => {
//   await connectDB();
  
//   const { searchParams } = new URL(request.url);
//   const category = searchParams.get("category");

//   const query: any = {};
//   if (category) query.category = category;

//   const contractSizes = await ContractSize.find(query).lean();

//   return NextResponse.json({ data: contractSizes });
// });
// GET - List contract sizes grouped by category
export const GET = withAuth(async (request: NextRequest, userId: string) => {
  await connectDB();

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const match: any = {};
  if (category) match.category = category;

  const grouped = await ContractSize.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$category",
        instruments: {
          $push: {
            _id: "$_id",
            symbol: "$symbol",
            size: "$size",
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        category: "$_id",
        instruments: 1,
      },
    },
  ]);

  return NextResponse.json({ data: grouped });
});


// POST - Create category with pairs
export const POST = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();
    const body = await request.json();

    if (!body.category || !body.symbol) {
      return NextResponse.json({ message: "Invalid data" }, { status: 400 });
    }

    const doc = new ContractSize(body);
    await doc.save();

    return NextResponse.json({ message: "Created", data: doc }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
});

// PUT - Update a category or pair
export const PUT = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ message: "ID required" }, { status: 400 });
    }

    const updated = await ContractSize.findByIdAndUpdate(id, body, { new: true });

    if (!updated) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Updated", data: updated });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
});

// DELETE - Remove a category
export const DELETE = withAuth(async (request: NextRequest, userId: string) => {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ message: "ID required" }, { status: 400 });
    }

    const deleted = await ContractSize.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Deleted" });
  } catch (err: any) {
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
});
