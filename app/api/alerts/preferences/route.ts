import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { DEFAULT_ALERT_PREFERENCES } from "@/lib/trading/alerts"
import { getSession } from "@/lib/session"
import { z } from "zod"

const alertPreferencesSchema = z.object({
  dailyDigest: z.boolean().optional(),
  weakHours: z.boolean().optional(),
  weakDays: z.boolean().optional(),
  weakSessions: z.boolean().optional(),
  edgeAlerts: z.boolean().optional(),
  streakWarnings: z.boolean().optional(),
  seasonAlerts: z.boolean().optional(),
  instrumentSession: z.boolean().optional(),
  todaySummary: z.boolean().optional(),
  behaviorAlerts: z.boolean().optional(),
  researchAlerts: z.boolean().optional(),
  deadZoneAlerts: z.boolean().optional(),
  overlapAlerts: z.boolean().optional(),
  keySessionAlerts: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const user = await User.findById(session.sub).select("alertPreferences").lean()

    return NextResponse.json({
      preferences: {
        ...DEFAULT_ALERT_PREFERENCES,
        ...(user?.alertPreferences || {}),
      },
    })
  } catch (error) {
    console.error("Failed to load alert preferences:", error)
    return NextResponse.json({ error: "Unable to load alert preferences" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = alertPreferencesSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 },
      )
    }

    await connectDB()
    const user = await User.findById(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    user.alertPreferences = {
      ...DEFAULT_ALERT_PREFERENCES,
      ...(user.alertPreferences || {}),
      ...parsed.data,
    }
    await user.save()

    return NextResponse.json({ preferences: user.alertPreferences })
  } catch (error) {
    console.error("Failed to update alert preferences:", error)
    return NextResponse.json({ error: "Unable to update alert preferences" }, { status: 500 })
  }
}
