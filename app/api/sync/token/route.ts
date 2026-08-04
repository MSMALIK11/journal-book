import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { generateSyncApiKey, getSyncAuth } from "@/lib/sync-auth"
import { getSession } from "@/lib/session"

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await connectDB()
  const syncApiKey = generateSyncApiKey()

  await User.findByIdAndUpdate(session.sub, {
    $set: { sync_api_key: syncApiKey },
  })

  return NextResponse.json({
    sync_api_key: syncApiKey,
    message: "Copy this key now. It will not be shown again.",
  })
}

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await connectDB()
  const user = await User.findById(session.sub).select("sync_api_key sync_last_heartbeat")
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  const connected =
    user.sync_last_heartbeat &&
    Date.now() - new Date(user.sync_last_heartbeat).getTime() < 60_000

  return NextResponse.json({
    has_sync_key: Boolean(user.sync_api_key),
    extension_connected: Boolean(connected),
    last_heartbeat: user.sync_last_heartbeat?.toISOString() || null,
  })
}

export async function DELETE(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const session = await getSession(request)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await connectDB()
  await User.findByIdAndUpdate(session.sub, {
    $unset: { sync_api_key: "", sync_last_heartbeat: "" },
  })

  return NextResponse.json({ revoked: true })
}
