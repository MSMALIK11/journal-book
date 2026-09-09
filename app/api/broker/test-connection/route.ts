import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { brokerTestConnectionSchema } from "@/lib/broker/broker-config"
import {
  getXmCredentialsForWorker,
  loadBrokerConfig,
  recordConnectionCheck,
} from "@/lib/broker/broker-config-service"
import { isMt5WorkerConfigured, loginMt5Worker } from "@/lib/broker/mt5-worker"
import { getSession } from "@/lib/session"

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const parsed = brokerTestConnectionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid connection payload" }, { status: 400 })
    }

    await connectDB()
    const stored = await getXmCredentialsForWorker(session.sub)

    // Without a stored credential there is nothing to attach the result to, so
    // the status would silently fall back to "not connected" after a success.
    if (!stored) {
      return NextResponse.json(
        { ok: false, error: "Save your MT5 configuration before testing the connection" },
        { status: 409 },
      )
    }

    const login = parsed.data.login ?? stored.login
    const server = parsed.data.server ?? stored.server
    const password = parsed.data.password ?? stored.password

    if (!login || !server || !password) {
      return NextResponse.json(
        { ok: false, error: "Account login, server, and password are required to test the connection" },
        { status: 400 },
      )
    }

    if (!isMt5WorkerConfigured()) {
      await recordConnectionCheck(session.sub, "unavailable", "MT5 worker is not configured")
      const config = await loadBrokerConfig(session.sub)
      return NextResponse.json(
        { ok: false, status: "unavailable", error: "MT5 worker is not configured", config },
        { status: 501 },
      )
    }

    const result = await loginMt5Worker({ login, password, server })
    const status = result.ok ? "connected" : "error"
    await recordConnectionCheck(session.sub, status, result.message || (result.ok ? "Connected successfully" : "Connection failed"))
    const config = await loadBrokerConfig(session.sub)

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, status, error: result.message || "Connection failed", config },
        { status: 400 },
      )
    }

    return NextResponse.json({
      ok: true,
      status,
      message: result.message || "Connected successfully",
      config,
    })
  } catch (error) {
    console.error("Broker connection test failed:", error)
    return NextResponse.json({ ok: false, error: "Connection failed" }, { status: 400 })
  }
}
