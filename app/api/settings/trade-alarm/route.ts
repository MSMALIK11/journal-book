import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import {
  DEFAULT_TRADE_ALARM_PREFERENCES,
  normalizeTradeAlarmPreferences,
  type TradeAlarmPreferences,
} from "@/lib/new-trade-alarm-settings"
import { getSession } from "@/lib/session"
import { z } from "zod"

const tradeAlarmSchema = z.object({
  enabled: z.boolean().optional(),
  soundMode: z.enum(["once", "manual"]).optional(),
  soundId: z.enum(["urgent-simple-tone-loop", "classic-alarm"]).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const user = await User.findById(session.sub).select("tradeAlarmPreferences").lean()

    return NextResponse.json({
      preferences: normalizeTradeAlarmPreferences(
        user?.tradeAlarmPreferences as Partial<TradeAlarmPreferences> | undefined,
      ),
    })
  } catch (error) {
    console.error("Failed to load trade alarm preferences:", error)
    return NextResponse.json({ error: "Unable to load trade alarm preferences" }, { status: 500 })
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

    const body = await request.json()
    const normalizedInput = normalizeTradeAlarmPreferences({
      ...DEFAULT_TRADE_ALARM_PREFERENCES,
      ...(typeof body === "object" && body ? body : {}),
    })

    const parsed = tradeAlarmSchema.safeParse(normalizedInput)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid preferences" },
        { status: 400 },
      )
    }

    await connectDB()
    const user = await User.findById(session.sub)
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    user.tradeAlarmPreferences = normalizeTradeAlarmPreferences({
      ...DEFAULT_TRADE_ALARM_PREFERENCES,
      ...(user.tradeAlarmPreferences || {}),
      ...parsed.data,
    })
    await user.save()

    return NextResponse.json({ preferences: user.tradeAlarmPreferences })
  } catch (error) {
    console.error("Failed to update trade alarm preferences:", error)
    return NextResponse.json({ error: "Unable to update trade alarm preferences" }, { status: 500 })
  }
}
