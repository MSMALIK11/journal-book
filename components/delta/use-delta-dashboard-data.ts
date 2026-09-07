"use client"

import useSWR, { mutate as globalMutate, preload } from "swr"
import {
  deltaApiPath,
  type DeltaAccount,
  type DeltaEnvironment,
  type OrderRow,
  type PositionRow,
} from "@/components/delta/delta-shared"
import type { DeltaProductInfo } from "@/lib/broker/delta-product"
import { authFetch } from "@/lib/client-auth"

/** Product metadata and leverage change rarely — reuse the cached copy this long. */
const MARKET_DATA_DEDUPE_MS = 30_000

type DeltaAccountsResponse = {
  accounts: DeltaAccount[]
  envOverride?: boolean
  serverLiveBlocked?: boolean
  maxOrderSize?: number
  maxAccounts?: number
}

type DeltaPositionsResponse = {
  positions: PositionRow[]
}

type DeltaOrdersResponse = {
  orders: OrderRow[]
}

export type DeltaMarketDataResponse = {
  product: DeltaProductInfo & { leverage?: number }
  markPrice?: number
  maxOrderSize?: number
}

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
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
    { revalidateOnFocus: false },
  )
}

export function useDeltaOrders(environment: DeltaEnvironment, enabled = true) {
  return useSWR<DeltaOrdersResponse>(enabled ? deltaOrdersKey(environment) : null, fetcher, {
    revalidateOnFocus: false,
  })
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
    { revalidateOnFocus: false, dedupingInterval: MARKET_DATA_DEDUPE_MS },
  )
}

/** Warm the cache for symbols the user is likely to switch to, so the ticket renders instantly. */
export function prefetchDeltaMarketData(
  environment: DeltaEnvironment,
  symbols: readonly string[],
  accountId?: string | null,
) {
  for (const symbol of symbols) {
    void preload(deltaMarketDataKey(environment, symbol, accountId), fetcher)
  }
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
