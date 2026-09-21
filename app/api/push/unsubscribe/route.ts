import { type NextRequest, NextResponse } from "next/server"
import { getSession } from "@/lib/session"
import { removePushSubscription } from "@/lib/push/web-push"
import { z } from "zod"

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
})

export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = unsubscribeSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
  }

  await removePushSubscription(session.sub, parsed.data.endpoint)
  return NextResponse.json({ ok: true })
}
