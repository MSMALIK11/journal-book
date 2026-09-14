import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getSyncAuth } from "@/lib/sync-auth"
import { withSyncCors } from "@/lib/sync-cors"
import { decodeScreenshotJpeg } from "@/lib/telegram/screenshot"
import { notifyTelegramTradeEvent, sendTelegramChartFollowUp } from "@/lib/telegram/send-trade-alert"

const testSchema = z.object({
  screenshotJpeg: z.string().min(32).max(1_800_000),
  kind: z.enum(["open", "close"]).optional(),
  side: z.string().trim().min(1).max(16).optional(),
  instrument: z.string().trim().min(1).max(40).optional(),
  price: z.number().finite().optional(),
  exitPrice: z.number().finite().optional(),
  followUp: z.boolean().optional(),
})

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await request.json().catch(() => null)
    const parsed = testSchema.safeParse(body)
    if (!parsed.success) {
      return withSyncCors(
        request,
        NextResponse.json({ error: "Screenshot is required for the Telegram test" }, { status: 400 }),
      )
    }

    const photo = decodeScreenshotJpeg(parsed.data.screenshotJpeg)
    if (!photo) {
      return withSyncCors(
        request,
        NextResponse.json({ error: "Could not read the chart screenshot" }, { status: 400 }),
      )
    }

    const result = parsed.data.followUp
      ? await sendTelegramChartFollowUp(auth.userId, photo)
      : await notifyTelegramTradeEvent(
          auth.userId,
          {
            kind: parsed.data.kind || "open",
            side: parsed.data.side || "Long",
            instrument: parsed.data.instrument || "TEST",
            price: parsed.data.price ?? 0,
            exitPrice: parsed.data.exitPrice,
            accountName: "Demo",
            demo: true,
          },
          { force: true, photo },
        )

    if (!result.ok) {
      return withSyncCors(
        request,
        NextResponse.json({ ok: false, error: result.error || "Telegram send failed" }, { status: 502 }),
      )
    }

    return withSyncCors(request, NextResponse.json({ ok: true }))
  } catch (error) {
    console.error("Telegram screenshot test failed:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to send Telegram screenshot test" }, { status: 500 }),
    )
  }
}
