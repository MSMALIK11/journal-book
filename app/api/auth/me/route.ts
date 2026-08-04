import { type NextRequest, NextResponse } from "next/server"
import { findPublicUser } from "@/lib/auth-server"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  const session = await getSession(request)
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await findPublicUser(session.sub)
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json(
    { user },
    { headers: { "Cache-Control": "no-store" } },
  )
}
