import { NextRequest, NextResponse } from "next/server"
import mongoose from "mongoose"
import connectDB from "@/app/api/db/mongoose"
import DeltaOrderLog from "@/app/api/models/DeltaOrderLog"
import { getDeltaEnvironmentFromRequest } from "@/lib/broker/delta-api-params"
import { getPositions } from "@/lib/broker/delta-exchange"
import {
  getDeltaCredentialsByAccountId,
  hasEnvDeltaCredentials,
  listDeltaAccounts,
} from "@/lib/broker/delta-credentials"
import { buildAccountActivity, sortAccountsByActivity } from "@/lib/delta/account-activity"
import { normalizeDeltaPositions } from "@/lib/broker/delta-positions"
import { getSession } from "@/lib/session"

const ORDERS_PER_ACCOUNT = 30

export async function GET(request: NextRequest) {
  try {
    const session = await getSession(request)
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const environment = getDeltaEnvironmentFromRequest(request)
    await connectDB()

    const orderLogs = await DeltaOrderLog.find({
      userId: new mongoose.Types.ObjectId(session.sub),
      environment,
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean()

    const orders = orderLogs.map((order) => ({
      id: order._id.toString(),
      accountId: order.brokerAccountId?.toString() ?? (hasEnvDeltaCredentials(environment) ? "env" : undefined),
      accountLabel: order.accountLabel,
      brokerOrderId: order.brokerOrderId,
      symbol: order.symbol,
      side: order.side,
      size: order.size,
      price: order.price,
      source: order.source === "auto" ? ("auto" as const) : ("manual" as const),
      createdAt: order.createdAt?.toISOString(),
    }))

    if (hasEnvDeltaCredentials(environment)) {
      const resolved = await getDeltaCredentialsByAccountId(session.sub, "env", environment)
      if (!resolved) {
        return NextResponse.json({ error: "No Delta API credentials configured" }, { status: 400 })
      }
      const response = await getPositions(resolved.creds, environment)
      const positions = normalizeDeltaPositions(response.result).map((p) => ({
        ...p,
        accountId: "env",
        accountLabel: resolved.account.label,
      }))
      const accounts = buildAccountActivity({
        accounts: [{ id: "env", label: resolved.account.label, enabled: true }],
        positions,
        orders,
      })
      return NextResponse.json({ accounts: sortAccountsByActivity(accounts) })
    }

    const accountList = await listDeltaAccounts(session.sub, environment)
    if (accountList.length === 0) {
      return NextResponse.json({ error: "No Delta accounts configured" }, { status: 400 })
    }

    const errors: Record<string, string> = {}
    const positions: Array<Record<string, unknown>> = []

    const settled = await Promise.allSettled(
      accountList.map(async (account) => {
        const resolved = await getDeltaCredentialsByAccountId(session.sub, account.id, environment, {
          allowDisabled: true,
        })
        if (!resolved) throw new Error("missing credentials")
        const response = await getPositions(resolved.creds, environment)
        return normalizeDeltaPositions(response.result).map((p) => ({
          ...p,
          accountId: account.id,
          accountLabel: account.label,
        }))
      }),
    )

    settled.forEach((entry, index) => {
      const account = accountList[index]
      if (!account) return
      if (entry.status === "fulfilled") {
        positions.push(...entry.value)
      } else {
        errors[account.id] = entry.reason instanceof Error ? entry.reason.message : String(entry.reason)
      }
    })

    const perAccountOrderCount = new Map<string, number>()
    const trimmedOrders: typeof orders = []
    for (const order of orders) {
      const id = order.accountId ?? "unknown"
      const count = perAccountOrderCount.get(id) ?? 0
      if (count >= ORDERS_PER_ACCOUNT) continue
      perAccountOrderCount.set(id, count + 1)
      trimmedOrders.push(order)
    }

    const accounts = buildAccountActivity({
      accounts: accountList.map((a) => ({ id: a.id, label: a.label, enabled: a.enabled })),
      positions: positions as Parameters<typeof buildAccountActivity>[0]["positions"],
      orders: trimmedOrders,
      errors,
    })

    return NextResponse.json({ accounts: sortAccountsByActivity(accounts) })
  } catch (error) {
    console.error("Failed to load Delta account activity:", error)
    const message = error instanceof Error ? error.message : "Unable to load account activity"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
