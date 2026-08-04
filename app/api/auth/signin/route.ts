import { type NextRequest, NextResponse } from "next/server"
import { authenticateUser } from "@/lib/auth-server"
import { checkRateLimit, clearRateLimit, getRateLimitKey } from "@/lib/rate-limit"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session"
import { signInSchema } from "@/lib/validations/auth"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const parsed = signInSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid credentials" },
        { status: 400 },
      )
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateLimitKey = getRateLimitKey(ip, parsed.data.email)
    const rateLimit = checkRateLimit(rateLimitKey)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many sign-in attempts. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      )
    }

    const user = await authenticateUser(parsed.data.email, parsed.data.password)
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 })
    }

    clearRateLimit(rateLimitKey)
    const token = await createSessionToken(user.id, user.email)
    const response = NextResponse.json(
      { user },
      { headers: { "Cache-Control": "no-store" } },
    )
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
    return response
  } catch (error) {
    console.error("Sign-in failed:", error)
    return NextResponse.json({ error: "Unable to sign in right now" }, { status: 500 })
  }
}
