"use client"

import { useCallback, useMemo } from "react"
import useSWR from "swr"
import { type DeltaEnvironment } from "@/components/delta/delta-shared"
import { deltaWalletsKey } from "@/components/delta/use-delta-dashboard-data"
import { authFetch } from "@/lib/client-auth"

export type DeltaAccountMarginEntry = {
  accountId: string
  label: string
  marginUsd: number | null
  balanceUsd?: number | null
  loading: boolean
  error?: string
}

type BatchWalletsResponse = {
  wallets: Record<
    string,
    { label: string; marginUsd: number; balanceUsd?: number } | { label: string; error: string }
  >
  error?: string
}

async function batchWalletsFetcher(url: string): Promise<BatchWalletsResponse> {
  const response = await authFetch(url)
  const data = (await response.json()) as BatchWalletsResponse
  if (!response.ok) throw new Error(data.error || "Failed to load wallets")
  return data
}

export function useDeltaAccountMargins(
  environment: DeltaEnvironment,
  accountIds: string[],
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled ?? true
  const swrKey = enabled && accountIds.length > 0 ? deltaWalletsKey(environment, accountIds) : null

  const { data, error, isLoading, mutate } = useSWR<BatchWalletsResponse>(
    swrKey,
    batchWalletsFetcher,
    { revalidateOnFocus: false },
  )

  const refresh = useCallback(() => {
    void mutate()
  }, [mutate])

  const entries = useMemo(() => {
    const next: Record<string, DeltaAccountMarginEntry> = {}
    for (const accountId of accountIds) {
      const wallet = data?.wallets?.[accountId]
      if (!wallet) {
        next[accountId] = {
          accountId,
          label: accountId,
          marginUsd: null,
          balanceUsd: null,
          loading: isLoading,
          error: error instanceof Error ? error.message : undefined,
        }
        continue
      }
      if ("marginUsd" in wallet) {
        next[accountId] = {
          accountId,
          label: wallet.label,
          marginUsd: wallet.marginUsd,
          balanceUsd: wallet.balanceUsd ?? wallet.marginUsd,
          loading: false,
        }
      } else {
        next[accountId] = {
          accountId,
          label: wallet.label,
          marginUsd: null,
          balanceUsd: null,
          loading: false,
          error: wallet.error,
        }
      }
    }
    return next
  }, [accountIds, data, error, isLoading])

  const list = useMemo(
    () => accountIds.map((id) => entries[id]).filter(Boolean) as DeltaAccountMarginEntry[],
    [accountIds, entries],
  )

  const minMarginAccount = useMemo(() => {
    const funded = list.filter((entry) => !entry.loading && entry.marginUsd != null && entry.marginUsd > 0)
    if (funded.length === 0) return null
    return funded.reduce((min, cur) => (cur.marginUsd! < min.marginUsd! ? cur : min), funded[0])
  }, [list])

  const readyCount = list.filter((entry) => !entry.loading && (entry.marginUsd ?? 0) > 0).length

  return {
    entries,
    list,
    minMarginAccount,
    readyCount,
    loading: isLoading,
    refresh,
  }
}

export function formatMarginUsd(value: number | null | undefined): string {
  if (value == null) return "—"
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function isLowMargin(value: number | null | undefined): boolean {
  return value == null || value <= 0
}
