import { NextRequest, NextResponse } from "next/server"
import { getTradeSyncEvents } from "@/lib/sync-last-event"
import { getSession } from "@/lib/session"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { event, events } = await getTradeSyncEvents(session.sub)
    return NextResponse.json(
      { event, events },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to read last sync event:", error)
    return NextResponse.json({ error: "Unable to read sync event" }, { status: 500 })
  }
}
