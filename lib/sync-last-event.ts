import "server-only"

import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

export type PersistedTradeSyncEvent = {
  eventId: string
  at: string
  accountId: string
  accountName?: string
  imported: number
  updated: number
  skipped: number
  latestTrade?: {
    id: string
    instrument: string
    trade_type: string
    entry_date: string
    entry_price: number
    signal?: string | null
  }
}

export async function recordTradeSyncEvent(
  userId: string,
  payload: Omit<PersistedTradeSyncEvent, "eventId" | "at">,
) {
  const event: PersistedTradeSyncEvent = {
    eventId: `${Date.now()}-${payload.accountId}-${payload.imported}-${payload.updated}`,
    at: new Date().toISOString(),
    ...payload,
  }

  await connectDB()
  await User.updateOne({ _id: userId }, { $set: { sync_last_trade_event: event } })
  return event
}

export async function getTradeSyncEvent(userId: string): Promise<PersistedTradeSyncEvent | null> {
  await connectDB()
  const user = await User.findById(userId).select("sync_last_trade_event").lean()
  const event = user?.sync_last_trade_event as PersistedTradeSyncEvent | undefined
  return event?.eventId ? event : null
}
