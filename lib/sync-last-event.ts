import "server-only"

import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

const RING_SIZE = 10
let eventSeq = 0

export type PersistedTradeSyncEvent = {
  eventId: string
  at: string
  kind?: "open" | "close"
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
    is_open?: boolean
  }
}

function asEvent(value: unknown): PersistedTradeSyncEvent | null {
  if (!value || typeof value !== "object") return null
  const event = value as PersistedTradeSyncEvent
  return event.eventId ? event : null
}

function mergeRing(previous: unknown, last: unknown, next: PersistedTradeSyncEvent) {
  const ring = Array.isArray(previous)
    ? previous.map(asEvent).filter((event): event is PersistedTradeSyncEvent => Boolean(event))
    : []
  const lastEvent = asEvent(last)
  if (lastEvent && !ring.some((event) => event.eventId === lastEvent.eventId)) {
    ring.push(lastEvent)
  }
  if (!ring.some((event) => event.eventId === next.eventId)) {
    ring.push(next)
  }
  return ring.slice(-RING_SIZE)
}

export async function recordTradeSyncEvent(
  userId: string,
  payload: Omit<PersistedTradeSyncEvent, "eventId" | "at">,
) {
  await connectDB()
  const user = await User.findById(userId).select("sync_last_trade_event sync_last_trade_events").lean()
  const event: PersistedTradeSyncEvent = {
    eventId: `${Date.now()}-${payload.kind || "sync"}-${payload.accountId}-${payload.latestTrade?.id || "none"}-${(eventSeq = (eventSeq + 1) % 1000)}`,
    at: new Date().toISOString(),
    ...payload,
  }
  const events = mergeRing(user?.sync_last_trade_events, user?.sync_last_trade_event, event)
  await User.updateOne(
    { _id: userId },
    { $set: { sync_last_trade_event: event, sync_last_trade_events: events } },
  )
  return event
}

export async function getTradeSyncEvent(userId: string): Promise<PersistedTradeSyncEvent | null> {
  const { event } = await getTradeSyncEvents(userId)
  return event
}

export async function getTradeSyncEvents(userId: string): Promise<{
  event: PersistedTradeSyncEvent | null
  events: PersistedTradeSyncEvent[]
}> {
  await connectDB()
  const user = await User.findById(userId).select("sync_last_trade_event sync_last_trade_events").lean()
  const last = asEvent(user?.sync_last_trade_event)
  const stored = Array.isArray(user?.sync_last_trade_events)
    ? user.sync_last_trade_events.map(asEvent).filter((event): event is PersistedTradeSyncEvent => Boolean(event))
    : []
  const byId = new Map<string, PersistedTradeSyncEvent>()
  for (const event of stored) byId.set(event.eventId, event)
  if (last) byId.set(last.eventId, last)
  const events = [...byId.values()]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-RING_SIZE)
  return {
    event: last || events.at(-1) || null,
    events,
  }
}
