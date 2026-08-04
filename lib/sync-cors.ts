import type { NextRequest } from "next/server"

export function getSyncCorsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin")
  const allowOrigin =
    origin &&
    (origin.startsWith("chrome-extension://") ||
      origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1"))
      ? origin
      : "*"

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Sync-Key",
    "Access-Control-Max-Age": "86400",
  }
}

export function withSyncCors<T extends Response>(request: NextRequest, response: T): T {
  const headers = getSyncCorsHeaders(request)
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value)
  }
  return response
}
