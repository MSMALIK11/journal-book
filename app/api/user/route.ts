import { NextResponse } from "next/server";
import connectDB from "@/app/api/db/mongodb";
import User from "@/app/api/models/User";
import { withAuth } from "../middleware/withAuth";

// GET user profile (protected)
export const GET = withAuth(async (_req, userId) => {
  await connectDB();

  try {
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
});
