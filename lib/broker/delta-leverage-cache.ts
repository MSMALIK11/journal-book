import type { DeltaEnvironment } from "@/lib/broker/delta-env"

/**
 * Position leverage changes rarely, and reading it costs an authenticated Delta positions call on
 * every market-data request. The app invalidates on its own leverage writes; because serverless
 * instances may not share that invalidation, the TTL stays short.
 */
const TTL_MS = 15_000
const MAX_ENTRIES = 500

type LeverageKeyInput = {
  userId: string
  environment: DeltaEnvironment
  accountId: string | null | undefined
  symbol: string
}

type Entry = { leverage: number; expiresAt: number }

const cache = new Map<string, Entry>()

function buildKey(input: LeverageKeyInput): string {
  return `${input.userId}|${input.environment}|${input.accountId ?? "default"}|${input.symbol.toUpperCase()}`
}

export function getCachedPositionLeverage(input: LeverageKeyInput): number | null {
  const key = buildKey(input)
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  return entry.leverage
}

export function setCachedPositionLeverage(input: LeverageKeyInput, leverage: number): void {
  if (!Number.isFinite(leverage) || leverage <= 0) return
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now()
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key)
    }
  }
  cache.set(buildKey(input), { leverage, expiresAt: Date.now() + TTL_MS })
}

export function invalidatePositionLeverage(
  userId: string,
  environment: DeltaEnvironment,
  symbol: string,
): void {
  const upper = symbol.toUpperCase()
  const prefix = `${userId}|${environment}|`
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) && key.endsWith(`|${upper}`)) cache.delete(key)
  }
}
