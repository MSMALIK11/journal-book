import { type NextRequest, NextResponse } from "next/server"
import { findPublicUser } from "@/lib/auth-server"
import {
  createSessionToken,
  getSession,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionCookieOptions,
} from "@/lib/session"

/** Sliding refresh — extend the httpOnly cookie while the user is active in the PWA. */
export async function POST(request: NextRequest) {
  const session = await getSession(request)
  if (!session?.sub || !session.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await findPublicUser(session.sub)
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  const token = await createSessionToken(session.sub, session.email, SESSION_MAX_AGE)
  const response = NextResponse.json(
    { ok: true, expiresIn: SESSION_MAX_AGE },
    { headers: { "Cache-Control": "no-store" } },
  )
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(SESSION_MAX_AGE))
  return response
}
