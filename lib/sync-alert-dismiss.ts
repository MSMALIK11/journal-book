import "server-only"

import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

const RING_SIZE = 10
let eventSeq = 0

export type PersistedAlertDismissEvent = {
  eventId: string
  at: string
  accountId: string
  dismissedKeys: string[]
}

function asDismissEvent(value: unknown): PersistedAlertDismissEvent | null {
  if (!value || typeof value !== "object") return null
  const event = value as PersistedAlertDismissEvent
  if (!event.eventId || !event.accountId || !Array.isArray(event.dismissedKeys)) return null
  return event
}

function mergeRing(previous: unknown, last: unknown, next: PersistedAlertDismissEvent) {
  const ring = Array.isArray(previous)
    ? previous.map(asDismissEvent).filter((event): event is PersistedAlertDismissEvent => Boolean(event))
    : []
  const lastEvent = asDismissEvent(last)
  if (lastEvent && !ring.some((event) => event.eventId === lastEvent.eventId)) {
    ring.push(lastEvent)
  }
  if (!ring.some((event) => event.eventId === next.eventId)) {
    ring.push(next)
  }
  return ring.slice(-RING_SIZE)
}

export async function recordAlertDismissEvent(
  userId: string,
  accountId: string,
  dismissedKeys: string[],
) {
  const keys = [...new Set(dismissedKeys.filter(Boolean))]
  if (!keys.length) return null

  await connectDB()
  const user = await User.findById(userId)
    .select("sync_last_alert_dismiss sync_last_alert_dismiss_events")
    .lean()

  const event: PersistedAlertDismissEvent = {
    eventId: `dismiss-${Date.now()}-${accountId}-${(eventSeq = (eventSeq + 1) % 1000)}`,
    at: new Date().toISOString(),
    accountId,
    dismissedKeys: keys,
  }

  const events = mergeRing(
    user?.sync_last_alert_dismiss_events,
    user?.sync_last_alert_dismiss,
    event,
  )

  await User.updateOne(
    { _id: userId },
    { $set: { sync_last_alert_dismiss: event, sync_last_alert_dismiss_events: events } },
  )

  return event
}

export async function getAlertDismissEvents(userId: string): Promise<{
  event: PersistedAlertDismissEvent | null
  events: PersistedAlertDismissEvent[]
}> {
  await connectDB()
  const user = await User.findById(userId)
    .select("sync_last_alert_dismiss sync_last_alert_dismiss_events")
    .lean()

  const last = asDismissEvent(user?.sync_last_alert_dismiss)
  const stored = Array.isArray(user?.sync_last_alert_dismiss_events)
    ? user.sync_last_alert_dismiss_events
        .map(asDismissEvent)
        .filter((event): event is PersistedAlertDismissEvent => Boolean(event))
    : []

  const byId = new Map<string, PersistedAlertDismissEvent>()
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
