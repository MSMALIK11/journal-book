import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session"
import { getSyncCorsHeaders } from "@/lib/sync-cors"

const protectedPrefixes = [
  "/dashboard",
  "/live-sync",
  "/trades",
  "/profile",
  "/analytics",
  "/calendar",
  "/strategy",
  "/pip-calculator",
  "/settings",
  "/news",
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith("/api/sync")) {
    const corsHeaders = getSyncCorsHeaders(request)
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders })
    }
    const response = NextResponse.next()
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value)
    }
    return response
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySessionToken(token) : null
  const isProtected = protectedPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )

  if (isProtected && !session) {
    const loginUrl = new URL("/", request.url)
    loginUrl.searchParams.set("next", pathname)
    const response = NextResponse.redirect(loginUrl)
    if (token) response.cookies.delete(SESSION_COOKIE)
    return response
  }

  if (pathname === "/" && session) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/api/sync/:path*",
    "/",
    "/dashboard/:path*",
    "/live-sync/:path*",
    "/trades/:path*",
    "/profile/:path*",
    "/analytics/:path*",
    "/calendar/:path*",
    "/strategy/:path*",
    "/pip-calculator/:path*",
    "/settings/:path*",
    "/news/:path*",
  ],
}
