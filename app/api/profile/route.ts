import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getSession } from "@/lib/session"

const profileSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  mobile: z.string().trim().min(7, "Enter a valid mobile number").max(20),
  trading_style: z.enum(["Intraday", "Swing", "Options"]),
  risk_profile: z.enum(["Low", "Moderate", "High"]),
})

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await connectDB()
  const user = await User.findById(session.sub).select("email name mobile trading_style risk_profile timezone theme")
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  return NextResponse.json(
    { profile: user },
    { headers: { "Cache-Control": "no-store" } },
  )
}

export async function PATCH(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = profileSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid profile details" },
      { status: 400 },
    )
  }

  await connectDB()
  const profile = await User.findByIdAndUpdate(
    session.sub,
    { $set: parsed.data },
    { returnDocument: "after", runValidators: true },
  ).select("email name mobile trading_style risk_profile timezone theme")

  if (!profile) return NextResponse.json({ error: "User not found" }, { status: 404 })
  return NextResponse.json({ profile })
}
