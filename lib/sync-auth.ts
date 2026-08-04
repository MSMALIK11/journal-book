import "server-only"

import type { NextRequest } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { getSession } from "@/lib/session"

export type SyncAuth = {
  userId: string
  email: string
}

export async function getSyncAuth(request: NextRequest): Promise<SyncAuth | null> {
  const syncKeyHeader = request.headers.get("x-sync-key")
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  const syncKey =
    syncKeyHeader ||
    (bearer?.startsWith("jb_sync_") ? bearer : null)

  if (syncKey) {
    await connectDB()
    const user = await User.findOne({ sync_api_key: syncKey.trim() }).select("_id email")
    if (user) {
      return { userId: String(user._id), email: user.email }
    }
    return null
  }

  const session = await getSession(request)
  if (session) {
    return { userId: session.sub, email: session.email }
  }

  if (!bearer) return null

  await connectDB()
  const user = await User.findOne({ sync_api_key: bearer }).select("_id email")
  if (!user) return null

  return { userId: String(user._id), email: user.email }
}

export function generateSyncApiKey() {
  return `jb_sync_${crypto.randomUUID().replace(/-/g, "")}`
}
