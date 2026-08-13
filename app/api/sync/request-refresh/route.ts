import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { requestSyncRefresh } from "@/lib/sync-refresh-request"
import { getSession } from "@/lib/session"

/** Live Sync UI: ask the extension to scrape — or reload the TV chart like F5. */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    await connectDB()
    const queued = await requestSyncRefresh(session.sub, {
      reloadChart: Boolean(body?.reloadChart),
    })

    return NextResponse.json({
      ok: true,
      pending: queued.pending,
      reloadChart: Boolean(body?.reloadChart),
      at: queued.at.toISOString(),
    })
  } catch (error) {
    console.error("Failed to request sync refresh:", error)
    return NextResponse.json({ error: "Unable to request sync" }, { status: 500 })
  }
}
