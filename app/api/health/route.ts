import { NextResponse } from "next/server"

export async function GET() {
  const jwtSecret = process.env.JWT_SECRET || ""
  const checks = {
    mongoUriConfigured: Boolean(process.env.MONGODB_URI),
    jwtSecretConfigured: Boolean(jwtSecret),
    jwtSecretLongEnough: jwtSecret.length >= 32,
    dbConnected: false,
  }

  if (!checks.mongoUriConfigured) {
    return NextResponse.json(
      { status: "unavailable", reason: "MONGODB_URI is not set on the server", checks },
      { status: 503 },
    )
  }

  try {
    const { default: connectDB } = await import("@/app/api/db/mongoose")
    await connectDB()
    checks.dbConnected = true
  } catch (error) {
    return NextResponse.json(
      {
        status: "unavailable",
        reason: "Could not connect to MongoDB (check Atlas Network Access allows 0.0.0.0/0)",
        detail: error instanceof Error ? error.message : String(error),
        checks,
      },
      { status: 503 },
    )
  }

  const ok = checks.jwtSecretConfigured && checks.jwtSecretLongEnough
  return NextResponse.json(
    {
      status: ok ? "ok" : "degraded",
      reason: ok ? undefined : "JWT_SECRET missing or shorter than 32 characters",
      checks,
    },
    { status: ok ? 200 : 503 },
  )
}
