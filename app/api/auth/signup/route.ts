import { type NextRequest, NextResponse } from "next/server"
import { createUser } from "@/lib/auth-server"
import { checkRateLimit } from "@/lib/rate-limit"
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/session"
import { signUpSchema } from "@/lib/validations/auth"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const parsed = signUpSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid account details" },
        { status: 400 },
      )
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    const rateLimit = checkRateLimit(`signup:${ip}`, 3, 60 * 60 * 1000)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many accounts created. Try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(rateLimit.retryAfter) },
        },
      )
    }

    const user = await createUser(parsed.data.email, parsed.data.password)

    if (!user) {
      return NextResponse.json(
        { error: "An account with this email already exists. Please sign in instead." },
        { status: 409 },
      )
    }

    const token = await createSessionToken(user.id, user.email)
    const response = NextResponse.json(
      { user },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    )
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions)
    return response
  } catch (error) {
    console.error("Sign-up failed:", error)
    return NextResponse.json({ error: "Unable to create your account right now" }, { status: 500 })
  }
}
