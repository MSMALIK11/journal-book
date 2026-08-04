import { SignJWT } from "jose/jwt/sign"
import { jwtVerify } from "jose/jwt/verify"
import type { NextRequest } from "next/server"

export const SESSION_COOKIE = "session"
export const SESSION_MAX_AGE = 60 * 60 * 24

export interface SessionPayload {
  sub: string
  email: string
  exp?: number
  iat?: number
}

function getSecret() {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters")
  }
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(userId: string, email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuer("trading-journal")
    .setAudience("trading-journal-web")
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
      issuer: "trading-journal",
      audience: "trading-journal-web",
    })

    if (!payload.sub || typeof payload.email !== "string") return null
    return payload as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(request: NextRequest) {
  const cookieToken = request.cookies.get(SESSION_COOKIE)?.value
  const bearerToken = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]
  const token = cookieToken || bearerToken
  return token ? verifySessionToken(token) : null
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE,
}
