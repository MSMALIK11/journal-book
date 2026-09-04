export type ImportedTradeSnapshot = {
  id: string
  instrument: string
  trade_type: string
  entry_date: string
  entry_price: number
  signal?: string | null
  /** True when the imported TV row is still an open position. */
  is_open?: boolean
}

export type TradesUpdatedEvent = {
  type: "trades_updated"
  eventId?: string
  kind?: "open" | "close"
  accountId: string
  accountName?: string
  imported: number
  updated: number
  skipped: number
  latestTrade?: ImportedTradeSnapshot
}

export type AccountsUpdatedEvent = {
  type: "accounts_updated"
  created: { id: string; name: string }[]
  primaryAccountId?: string
}

export type SyncEvent = TradesUpdatedEvent | AccountsUpdatedEvent

type SyncListener = (event: SyncEvent) => void

function userListenerKey(userId: string) {
  return `user:${userId}`
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

/** Subscribe to sync events for all accounts under this user. */
export function subscribeSyncEvents(userId: string, listener: SyncListener) {
  const map = getListenerMap()
  const key = userListenerKey(userId)
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
  payload: Pick<
    TradesUpdatedEvent,
    "eventId" | "kind" | "imported" | "updated" | "skipped" | "accountName" | "latestTrade"
  >,
) {
  const event: TradesUpdatedEvent = { type: "trades_updated", accountId, ...payload }
  for (const listener of getListenerMap().get(userListenerKey(userId)) ?? []) {
    try {
      listener(event)
    } catch (error) {
      console.error("Sync event listener error:", error)
    }
  }
}

export function publishAccountsUpdated(
  userId: string,
  payload: Pick<AccountsUpdatedEvent, "created" | "primaryAccountId">,
) {
  if (!payload.created.length) return
  const event: AccountsUpdatedEvent = { type: "accounts_updated", ...payload }
  for (const listener of getListenerMap().get(userListenerKey(userId)) ?? []) {
    try {
      listener(event)
    } catch (error) {
      console.error("Sync event listener error:", error)
    }
  }
}
