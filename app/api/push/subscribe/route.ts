import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { isWebPushConfigured, savePushSubscription } from "@/lib/push/web-push"
import { z } from "zod"

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!isWebPushConfigured()) {
    return NextResponse.json(
      { error: "Push alerts are not configured on this server yet." },
      { status: 503 },
    )
  }

  const parsed = subscribeSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  await savePushSubscription(session.sub, {
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: request.headers.get("user-agent") || undefined,
  })

  return NextResponse.json({ ok: true })
}
