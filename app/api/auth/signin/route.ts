import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../../models/User";
import connectDB from "../../db/mongoose";

// Replace with your actual secret key
const JWT_SECRET = process.env.JWT_SECRET || "thisismeshoaibfuturebillionaire";

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    await connectDB();

    let user = await User.findOne({ email });

    if (!user) {
      // If user doesn't exist, create one
      const hashedPassword = await bcrypt.hash(password, 10);
      user = await User.create({
        email,
        name: name || "New User",
        password: hashedPassword,
      });
    } else {
      // If user exists, compare password
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
      }
    }

    // Create JWT Token
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Send token in HTTP-only cookie
    const response = NextResponse.json({
      message: "Signed in successfully",
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
      },
    });

    response.cookies.set({
      name: "token",
      value: token,
      httpOnly: true,
      path: "/",
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
