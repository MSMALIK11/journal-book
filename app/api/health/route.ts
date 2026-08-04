import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if MongoDB URI is configured
    if (!process.env.MONGODB_URI) {
      return NextResponse.json({ error: "MongoDB not configured" }, { status: 503 })
    }

    // Try to connect to MongoDB
    const { default: connectDB } = await import("@/app/api/db/mongoose")
    await connectDB()

    return NextResponse.json({ status: "ok" })
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503 })
  }
}
