import { NextRequest, NextResponse } from "next/server"
import { withSyncCors } from "@/lib/sync-cors"
import { getSyncAuth } from "@/lib/sync-auth"

export async function OPTIONS(request: NextRequest) {
  return withSyncCors(request, new NextResponse(null, { status: 204 }))
}

export async function GET(request: NextRequest) {
  const auth = await getSyncAuth(request)
  if (!auth) {
    return withSyncCors(request, NextResponse.json({ valid: false, error: "Invalid sync key" }, { status: 401 }))
  }

  return withSyncCors(request, NextResponse.json({ valid: true, email: auth.email }))
}
