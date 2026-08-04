import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { connectedThresholdMs, touchSyncHeartbeat } from "@/lib/sync-heartbeat"
import { getSession } from "@/lib/session"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

/** Extension: ping while TradingView tab is open. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await request.json().catch(() => ({}))
    const pollIntervalSeconds = Math.min(
      300,
      Math.max(0, Number(body.pollIntervalSeconds) || 30),
    )

    await touchSyncHeartbeat(auth.userId, pollIntervalSeconds)

    return withSyncCors(request, NextResponse.json({ ok: true, at: new Date().toISOString() }))
  } catch (error) {
    console.error("Heartbeat failed:", error)
    return withSyncCors(request, NextResponse.json({ error: "Heartbeat failed" }, { status: 500 }))
  }
}

/** Web dashboard: read extension heartbeat for the logged-in user (session auth). */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const user = await User.findById(session.sub).select(
      "sync_last_heartbeat sync_poll_interval_seconds",
    )
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const lastHeartbeat = user.sync_last_heartbeat?.toISOString() || null
    const pollIntervalSeconds = user.sync_poll_interval_seconds || 30
    const threshold = connectedThresholdMs(pollIntervalSeconds)
    const ageMs = user.sync_last_heartbeat
      ? Date.now() - new Date(user.sync_last_heartbeat).getTime()
      : null
    const connected = ageMs !== null && ageMs < threshold

    return NextResponse.json(
      {
        connected: Boolean(connected),
        last_heartbeat: lastHeartbeat,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to read heartbeat:", error)
    return NextResponse.json({ error: "Unable to read heartbeat" }, { status: 500 })
  }
}
