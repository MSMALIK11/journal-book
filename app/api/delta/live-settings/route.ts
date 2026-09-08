import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  isServerLiveTradingBlocked,
  isUserLiveTradingEnabled,
  setUserLiveTradingEnabled,
} from "@/lib/broker/delta-live-guard"
import { getSession } from "@/lib/session"

const patchSchema = z.object({
  enabled: z.boolean(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const enabled = await isUserLiveTradingEnabled(session.sub)
    return NextResponse.json({
      enabled,
      serverBlocked: isServerLiveTradingBlocked(),
    })
  } catch (error) {
    console.error("Failed to load Delta live settings:", error)
    return NextResponse.json({ error: "Unable to load live trading settings" }, { status: 500 })
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

    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const enabled = await setUserLiveTradingEnabled(session.sub, parsed.data.enabled)
    return NextResponse.json({
      enabled,
      serverBlocked: isServerLiveTradingBlocked(),
    })
  } catch (error) {
    console.error("Failed to update Delta live settings:", error)
    const message = error instanceof Error ? error.message : "Unable to update live trading settings"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
