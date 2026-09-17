import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { sendDailyTelegramSummary } from "@/lib/telegram/daily-summary"
import { getSession } from "@/lib/session"

const bodySchema = z.object({
  force: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    }

    const result = await sendDailyTelegramSummary(session.sub, {
      force: Boolean(parsed.data.force),
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error || "Failed to send summary" }, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error("Daily Telegram summary failed:", error)
    return NextResponse.json({ error: "Unable to send daily summary" }, { status: 500 })
  }
}
