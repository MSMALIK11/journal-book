import { NextRequest } from "next/server"
import { getAccountContext } from "@/lib/active-account"
import { subscribeSyncEvents } from "@/lib/sync-events"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { accountId } = await getAccountContext(request, session.sub)

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      send({ type: "connected", accountId, at: new Date().toISOString() })

      unsubscribe = subscribeSyncEvents(session.sub, (event) => {
        send(event)
      })

      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(heartbeat!)
        }
      }, 25_000)

      request.signal.addEventListener("abort", () => {
        unsubscribe?.()
        if (heartbeat) clearInterval(heartbeat)
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
    },
    cancel() {
      unsubscribe?.()
      if (heartbeat) clearInterval(heartbeat)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
