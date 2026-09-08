import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import mongoose from "mongoose"
import connectDB from "@/app/api/db/mongoose"
import BrokerCredential from "@/app/api/models/BrokerCredential"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getDeltaBaseUrl } from "@/lib/broker/delta-exchange"
import {
  getDeltaMaxAccounts,
  hasEnvDeltaCredentials,
  listDeltaAccounts,
  invalidateBrokerCredentialMigration,
  deltaCredentialEnvironmentFilter,
} from "@/lib/broker/delta-credentials"
import { isServerLiveTradingBlocked } from "@/lib/broker/delta-live-guard"
import { getDeltaOrderMaxSize } from "@/lib/broker/delta-orders"
import { encryptSecret } from "@/lib/encryption"
import { getSession } from "@/lib/session"

const createAccountSchema = z.object({
  label: z.string().min(1).max(40),
  apiKey: z.string().min(8).max(128),
  apiSecret: z.string().min(8).max(256),
  isDefault: z.boolean().optional(),
  environment: z.enum(["demo", "live"]).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()
    const accounts = await listDeltaAccounts(session.sub, environment)

    return NextResponse.json({
      accounts,
      environment,
      configured: hasEnvDeltaCredentials(environment) || accounts.length > 0,
      envOverride: hasEnvDeltaCredentials(environment),
      serverLiveBlocked: isServerLiveTradingBlocked(),
      baseUrl: getDeltaBaseUrl(environment),
      maxOrderSize: getDeltaOrderMaxSize(environment),
      maxAccounts: getDeltaMaxAccounts(),
    })
  } catch (error) {
    console.error("Failed to list Delta accounts:", error)
    return NextResponse.json({ error: "Unable to load Delta accounts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) {
      return NextResponse.json({ error: "Invalid request origin" }, { status: 403 })
    }

    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await request.json().catch(() => null)
    const parsed = createAccountSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid account payload" }, { status: 400 })
    }

    const queryEnvironment = getDeltaEnvironmentFromRequest(request)
    const environment = parsed.data.environment ?? queryEnvironment
    if (parsed.data.environment && parsed.data.environment !== queryEnvironment) {
      return NextResponse.json({ error: "Environment mismatch between request and payload" }, { status: 400 })
    }

    if (hasEnvDeltaCredentials(environment)) {
      return NextResponse.json(
        {
          error:
            environment === "live"
              ? "Remove DELTA_LIVE_API_KEY env override before adding DB accounts"
              : "Remove DELTA_API_KEY env override before adding DB accounts",
        },
        { status: 400 },
      )
    }

    await connectDB()
    invalidateBrokerCredentialMigration(session.sub)

    const userObjectId = new mongoose.Types.ObjectId(session.sub)
    const count = await BrokerCredential.countDocuments({
      userId: userObjectId,
      provider: "delta",
      ...deltaCredentialEnvironmentFilter(environment),
    })
    if (count >= getDeltaMaxAccounts()) {
      return NextResponse.json({ error: `Maximum ${getDeltaMaxAccounts()} Delta accounts allowed` }, { status: 400 })
    }

    const label = parsed.data.label.trim()
    const existing = await BrokerCredential.findOne({
      userId: userObjectId,
      provider: "delta",
      label,
      ...deltaCredentialEnvironmentFilter(environment),
    })
    if (existing) {
      return NextResponse.json({ error: "An account with this label already exists" }, { status: 409 })
    }

    const makeDefault = parsed.data.isDefault ?? count === 0
    if (makeDefault) {
      await BrokerCredential.updateMany(
        { userId: userObjectId, provider: "delta", ...deltaCredentialEnvironmentFilter(environment) },
        { $set: { isDefault: false } },
      )
    }

    const doc = await BrokerCredential.create({
      userId: userObjectId,
      provider: "delta",
      environment,
      label,
      isDefault: makeDefault,
      enabled: true,
      encryptedKey: encryptSecret(parsed.data.apiKey.trim()),
      encryptedSecret: encryptSecret(parsed.data.apiSecret.trim()),
      lastFour: parsed.data.apiKey.trim().slice(-4),
    })

    if (doc.environment !== environment) {
      await BrokerCredential.updateOne({ _id: doc._id }, { $set: { environment } })
      doc.environment = environment
    }

    invalidateBrokerCredentialMigration(session.sub)
    const accounts = await listDeltaAccounts(session.sub, environment)
    return NextResponse.json({
      account: {
        id: doc._id.toString(),
        label: doc.label,
        lastFour: doc.lastFour,
        isDefault: Boolean(doc.isDefault),
        enabled: doc.enabled !== false,
        environment,
      },
      accounts,
    })
  } catch (error) {
    console.error("Failed to create Delta account:", error)
    const message = error instanceof Error ? error.message : "Unable to create Delta account"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
