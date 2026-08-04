import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { completeSyncRefresh, getSyncRefreshState, isRefreshPendingForUser } from "@/lib/sync-refresh-request"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"
import { getSession } from "@/lib/session"

function readSyncKey(request: NextRequest) {
  const header = request.headers.get("x-sync-key")?.trim()
  if (header) return header

  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer?.startsWith("jb_sync_")) return bearer

  return null
}

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

/** Extension (sync key) → refreshRequested. Web UI (session) → pending + lastResult. */
export async function GET(request: NextRequest) {
  const syncKey = readSyncKey(request)

  if (syncKey) {
    try {
      await connectDB()
      const user = await User.findOne({ sync_api_key: syncKey })
        .select("sync_refresh_requested_at")
        .lean()

      if (!user) {
        return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const refreshRequested = isRefreshPendingForUser(
        String(user._id),
        user.sync_refresh_requested_at,
      )
      return withSyncCors(
        request,
        NextResponse.json({ refreshRequested, at: new Date().toISOString() }),
      )
    } catch (error) {
      console.error("Failed to read extension refresh status:", error)
      return withSyncCors(
        request,
        NextResponse.json({ error: "Unable to read refresh status" }, { status: 500 }),
      )
    }
  }

  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    await connectDB()
    const state = await getSyncRefreshState(session.sub)
    return NextResponse.json(
      { ...state, at: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Failed to read UI refresh status:", error)
    return NextResponse.json({ error: "Unable to read refresh status" }, { status: 500 })
  }
}

/** Extension: mark UI refresh complete. */
export async function POST(request: NextRequest) {
  try {
    const auth = await getSyncAuth(request)
    if (!auth) {
      return withSyncCors(request, NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
    }

    const body = await request.json().catch(() => ({}))
    await connectDB()
    await completeSyncRefresh(auth.userId, body?.result ?? { ok: true })

    return withSyncCors(request, NextResponse.json({ ok: true }))
  } catch (error) {
    console.error("Failed to complete refresh:", error)
    return withSyncCors(
      request,
      NextResponse.json({ error: "Unable to complete refresh" }, { status: 500 }),
    )
  }
}
