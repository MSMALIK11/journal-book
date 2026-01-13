import { NextRequest, NextResponse } from "next/server";
import connectDB from "../../db/mongoose";
import { withAuth } from "../../middleware/withAuth";
import Strategy from "../../models/Strategy";

// DELETE /api/strategies/:id
export const DELETE = withAuth(
  async (request: NextRequest, userId: string, { params }: { params: { id: string } }) => {
    try {
      await connectDB();
      const strategyId = params.id;

      const deleted = await Strategy.findOneAndDelete({ _id: strategyId, userId });

      if (!deleted) {
        return NextResponse.json(
          { message: "Strategy not found or unauthorized" },
          { status: 404 }
        );
      }

      return NextResponse.json({ message: "Strategy deleted Successfully" });
    } catch (error: any) {
      return NextResponse.json(
        { message: "Failed to delete strategy", error: error.message },
        { status: 500 }
      );
    }
  }
);
