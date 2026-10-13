"use client"

import { useMemo } from "react"
import useSWR, { mutate as globalMutate, preload } from "swr"
import {
  deltaApiPath,
  type DeltaAccount,
  type DeltaEnvironment,
  type OrderRow,
  type PositionRow,
} from "@/components/delta/delta-shared"
import type { DeltaProductInfo } from "@/lib/broker/delta-product"
import {
  buildAccountActivity,
  sortAccountsByActivity,
  type DeltaAccountActivityRow,
} from "@/lib/delta/account-activity"
import { authFetch } from "@/lib/client-auth"

/** Product metadata and leverage change rarely — reuse the cached copy this long. */
const MARKET_DATA_DEDUPE_MS = 30_000
/** Positions/orders are heavy on demo — avoid duplicate Delta API hits within this window. */
const BROKER_DATA_DEDUPE_MS = 8_000

const ACTIVITY_ORDERS_PER_ACCOUNT = 30

type DeltaAccountsResponse = {
  accounts: DeltaAccount[]
  envOverride?: boolean
  serverLiveBlocked?: boolean
  maxOrderSize?: number
  maxAccounts?: number
}

type DeltaPositionsResponse = {
  positions: PositionRow[]
  accounts?: Array<{ accountId: string; label: string; error?: string }>
}

type DeltaOrdersResponse = {
  orders: OrderRow[]
}

export type DeltaMarketDataResponse = {
  product: DeltaProductInfo & { leverage?: number }
  markPrice?: number
  maxOrderSize?: number
}

class DeltaApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "DeltaApiError"
    this.status = status
  }
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new DeltaApiError(
      typeof data.error === "string" ? data.error : "Request failed",
      response.status,
    )
  }
  return data
}

export function deltaAccountsKey(environment: DeltaEnvironment) {
  return deltaApiPath("/api/delta/accounts", environment)
}

export function deltaPositionsKey(environment: DeltaEnvironment) {
  return deltaApiPath("/api/delta/positions", environment)
}

export function deltaOrdersKey(environment: DeltaEnvironment) {
  return deltaApiPath("/api/delta/orders", environment)
}

export function deltaWalletsKey(environment: DeltaEnvironment, accountIds: string[]) {
  if (accountIds.length === 0) return null
  const sorted = [...accountIds].sort().join(",")
  return `${deltaApiPath("/api/delta/wallets", environment)}&accountIds=${encodeURIComponent(sorted)}`
}

export function deltaMarketDataKey(
  environment: DeltaEnvironment,
  symbol: string,
  accountId?: string | null,
) {
  const account = accountId ? `&accountId=${encodeURIComponent(accountId)}` : ""
  return `${deltaApiPath("/api/delta/market-data", environment)}&symbol=${encodeURIComponent(symbol)}${account}`
}

export function useDeltaAccounts(environment: DeltaEnvironment) {
  return useSWR<DeltaAccountsResponse>(deltaAccountsKey(environment), fetcher, {
    revalidateOnFocus: false,
  })
}

export function useDeltaPositions(environment: DeltaEnvironment, enabled = true) {
  return useSWR<DeltaPositionsResponse>(
    enabled ? deltaPositionsKey(environment) : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: BROKER_DATA_DEDUPE_MS,
      keepPreviousData: true,
    },
  )
}

export function useDeltaOrders(environment: DeltaEnvironment, enabled = true) {
  return useSWR<DeltaOrdersResponse>(enabled ? deltaOrdersKey(environment) : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: BROKER_DATA_DEDUPE_MS,
    keepPreviousData: true,
  })
}

export function deriveDeltaAccountActivity(input: {
  accounts: DeltaAccount[]
  envOverride: boolean
  environment: DeltaEnvironment
  positions: PositionRow[]
  orders: OrderRow[]
  positionAccounts?: DeltaPositionsResponse["accounts"]
}): DeltaAccountActivityRow[] {
  const { accounts, envOverride, environment, positions, orders, positionAccounts } = input

  const activityAccounts = envOverride
    ? [
        {
          id: "env",
          label:
            positions.find((p) => p.accountLabel)?.accountLabel ??
            (environment === "live" ? "Env override (live)" : "Env override"),
          enabled: true,
        },
      ]
    : accounts.map((a) => ({ id: a.id, label: a.label, enabled: a.enabled }))

  const errors: Record<string, string> = {}
  for (const block of positionAccounts ?? []) {
    if (block.error) errors[block.accountId] = block.error
  }

  const perAccountOrderCount = new Map<string, number>()
  const trimmedOrders: OrderRow[] = []
  for (const order of orders) {
    const id = order.accountId ?? "unknown"
    const count = perAccountOrderCount.get(id) ?? 0
    if (count >= ACTIVITY_ORDERS_PER_ACCOUNT) continue
    perAccountOrderCount.set(id, count + 1)
    trimmedOrders.push(order)
  }

  return sortAccountsByActivity(
    buildAccountActivity({
      accounts: activityAccounts,
      positions,
      orders: trimmedOrders,
      errors: Object.keys(errors).length > 0 ? errors : undefined,
    }),
  )
}

export function useDerivedDeltaAccountActivity(
  accounts: DeltaAccount[],
  envOverride: boolean,
  environment: DeltaEnvironment,
  positions: PositionRow[],
  orders: OrderRow[],
  positionAccounts?: DeltaPositionsResponse["accounts"],
) {
  return useMemo(
    () =>
      deriveDeltaAccountActivity({
        accounts,
        envOverride,
        environment,
        positions,
        orders,
        positionAccounts,
      }),
    [accounts, envOverride, environment, positions, orders, positionAccounts],
  )
}

export function useDeltaMarketData(
  environment: DeltaEnvironment,
  symbol: string,
  accountId?: string | null,
  enabled = true,
) {
  return useSWR<DeltaMarketDataResponse>(
    enabled && symbol ? deltaMarketDataKey(environment, symbol, accountId) : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: MARKET_DATA_DEDUPE_MS,
      shouldRetryOnError: false,
      keepPreviousData: true,
    },
  )
}

/** Warm the cache for symbols the user is likely to switch to, so the ticket renders instantly. */
export function prefetchDeltaMarketData(
  environment: DeltaEnvironment,
  symbols: readonly string[],
  accountId?: string | null,
) {
  // Prefetch sequentially — parallel hits to Delta demo CDN often timeout together.
  void (async () => {
    for (const symbol of symbols) {
      try {
        await preload(deltaMarketDataKey(environment, symbol, accountId), fetcher)
      } catch {
        // best-effort warm cache
      }
    }
  })()
}

export async function refreshDeltaDashboard(
  environment: DeltaEnvironment,
  accountIds: string[] = [],
) {
  await Promise.all([
    globalMutate(deltaAccountsKey(environment)),
    globalMutate(deltaPositionsKey(environment)),
    globalMutate(deltaOrdersKey(environment)),
    accountIds.length > 0 ? globalMutate(deltaWalletsKey(environment, accountIds)) : Promise.resolve(),
  ])
}
