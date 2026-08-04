export type TradesUpdatedEvent = {
  type: "trades_updated"
  accountId: string
  imported: number
  updated: number
  skipped: number
}

type SyncListener = (event: TradesUpdatedEvent) => void

function listenerKey(userId: string, accountId: string) {
  return `${userId}:${accountId}`
}

const globalStore = globalThis as typeof globalThis & {
  __jbSyncListeners?: Map<string, Set<SyncListener>>
}

function getListenerMap() {
  if (!globalStore.__jbSyncListeners) {
    globalStore.__jbSyncListeners = new Map()
  }
  return globalStore.__jbSyncListeners
}

export function subscribeSyncEvents(userId: string, accountId: string, listener: SyncListener) {
  const map = getListenerMap()
  const key = listenerKey(userId, accountId)
  if (!map.has(key)) map.set(key, new Set())
  map.get(key)!.add(listener)

  return () => {
    map.get(key)?.delete(listener)
    if (map.get(key)?.size === 0) map.delete(key)
  }
}

export function publishTradesUpdated(
  userId: string,
  accountId: string,
  payload: Pick<TradesUpdatedEvent, "imported" | "updated" | "skipped">,
) {
  const event: TradesUpdatedEvent = { type: "trades_updated", accountId, ...payload }
  for (const listener of getListenerMap().get(listenerKey(userId, accountId)) ?? []) {
    try {
      listener(event)
    } catch (error) {
      console.error("Sync event listener error:", error)
    }
  }
}
