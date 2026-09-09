import { NextRequest, NextResponse } from "next/server"
import connectDB from "@/app/api/db/mongoose"
import { brokerConfigPutSchema, normalizeExecutionPreferences } from "@/lib/broker/broker-config"
import { loadBrokerConfig, saveBrokerConfig } from "@/lib/broker/broker-config-service"
import { getSession } from "@/lib/session"

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    await connectDB()
    const config = await loadBrokerConfig(session.sub)
    return NextResponse.json({ config })
  } catch (error) {
    console.error("Failed to load broker config:", error)
    return NextResponse.json({ error: "Unable to load broker configuration" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = brokerConfigPutSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid broker configuration" },
        { status: 400 },
      )
    }

    await connectDB()
    const current = await loadBrokerConfig(session.sub)
    const execution = normalizeExecutionPreferences(parsed.data.execution)
    const requestedOn = parsed.data.execution.enabled === true
    const canEnable = requestedOn && current.connection.status === "connected" && current.connection.hasPassword

    const config = await saveBrokerConfig(session.sub, {
      broker: parsed.data.broker,
      platform: parsed.data.platform,
      login: parsed.data.login,
      server: parsed.data.server,
      password: parsed.data.password,
      execution: { ...execution, enabled: canEnable },
      connectionStatus: current.connection.status,
      lastMessage: current.connection.lastMessage,
    })

    return NextResponse.json({
      config,
      message: "Configuration saved successfully",
    })
  } catch (error) {
    console.error("Failed to save broker config:", error)
    const message = error instanceof Error ? error.message : "Unable to save broker configuration"
    const status = message.includes("password") ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
