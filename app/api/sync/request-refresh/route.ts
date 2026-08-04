import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { requestSyncRefresh } from "@/lib/sync-refresh-request"
import { getSession } from "@/lib/session"

/** Live Sync UI: ask the extension to scrape TradingView on its next poll. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const queued = await requestSyncRefresh(session.sub)

    return NextResponse.json({
      ok: true,
      pending: queued.pending,
      at: queued.at.toISOString(),
    })
  } catch (error) {
    console.error("Failed to request sync refresh:", error)
    return NextResponse.json({ error: "Unable to request sync" }, { status: 500 })
  }
}
