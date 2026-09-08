import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import mongoose from "mongoose"
import connectDB from "@/app/api/db/mongoose"
import BrokerCredential from "@/app/api/models/BrokerCredential"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getBrokerAccountForUser, listDeltaAccounts, deltaCredentialEnvironmentFilter, invalidateBrokerCredentialMigration } from "@/lib/broker/delta-credentials"
import { getSession } from "@/lib/session"

const patchSchema = z.object({
  label: z.string().min(1).max(40).optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const { id } = await context.params
    const body = await request.json().catch(() => null)
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid update payload" }, { status: 400 })
    }

    await connectDB()
    const doc = await getBrokerAccountForUser(session.sub, id, environment)
    if (!doc) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    if (parsed.data.label && parsed.data.label.trim() !== doc.label) {
      const clash = await BrokerCredential.findOne({
        userId: new mongoose.Types.ObjectId(session.sub),
        provider: "delta",
        label: parsed.data.label.trim(),
        _id: { $ne: doc._id },
        ...deltaCredentialEnvironmentFilter(environment),
      })
      if (clash) {
        return NextResponse.json({ error: "An account with this label already exists" }, { status: 409 })
      }
      doc.label = parsed.data.label.trim()
    }

    if (parsed.data.isDefault === true) {
      await BrokerCredential.updateMany(
        { userId: doc.userId, provider: "delta", ...deltaCredentialEnvironmentFilter(environment) },
        { $set: { isDefault: false } },
      )
      doc.isDefault = true
    }

    if (typeof parsed.data.enabled === "boolean") {
      doc.enabled = parsed.data.enabled
    }

    await doc.save()
    invalidateBrokerCredentialMigration(session.sub)
    const accounts = await listDeltaAccounts(session.sub, environment)
    return NextResponse.json({ accounts })
  } catch (error) {
    console.error("Failed to update Delta account:", error)
    return NextResponse.json({ error: "Unable to update Delta account" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    const { id } = await context.params
    await connectDB()
    const doc = await getBrokerAccountForUser(session.sub, id, environment)
    if (!doc) return NextResponse.json({ error: "Account not found" }, { status: 404 })

    const wasDefault = doc.isDefault
    const docEnvironment = doc.environment ?? "demo"
    await doc.deleteOne()
    invalidateBrokerCredentialMigration(session.sub)

    if (wasDefault) {
      const next = await BrokerCredential.findOne({
        userId: new mongoose.Types.ObjectId(session.sub),
        provider: "delta",
        ...deltaCredentialEnvironmentFilter(docEnvironment),
      }).sort({ createdAt: 1 })
      if (next) {
        next.isDefault = true
        await next.save()
      }
    }

    const accounts = await listDeltaAccounts(session.sub, environment)
    return NextResponse.json({ accounts })
  } catch (error) {
    console.error("Failed to delete Delta account:", error)
    return NextResponse.json({ error: "Unable to delete Delta account" }, { status: 500 })
  }
}
