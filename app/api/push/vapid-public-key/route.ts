import { NextResponse } from "next/server"
import { getWebPushPublicKey, isWebPushConfigured } from "@/lib/push/web-push"

export async function GET() {
  const publicKey = getWebPushPublicKey()
  return NextResponse.json({
    publicKey,
    configured: isWebPushConfigured(),
  })
}
