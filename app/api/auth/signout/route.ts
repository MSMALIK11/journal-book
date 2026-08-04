import { type NextRequest, NextResponse } from "next/server"
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/session"

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
  }

  const response = NextResponse.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  )
  response.cookies.set(SESSION_COOKIE, "", {
    ...sessionCookieOptions,
    maxAge: 0,
  })
  return response
}
