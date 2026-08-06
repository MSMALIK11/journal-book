"use client"

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import useSWR, { mutate as globalMutate } from "swr"
import { authFetch } from "@/lib/client-auth"

export type TradingAccountSummary = {
  id: string
  userId: string
  name: string
  symbols: string[]
  isDefault: boolean
  color?: string
  tradeCount?: number
}

type AccountsResponse = {
  accounts: TradingAccountSummary[]
  activeAccountId: string
}

type ActiveAccountContextValue = {
  accounts: TradingAccountSummary[]
  activeAccountId?: string
  activeAccount?: TradingAccountSummary
  isLoading: boolean
  error: unknown
  switchVersion: number
  switchAccount: (accountId: string) => Promise<unknown>
  refresh: () => Promise<AccountsResponse | undefined>
  revalidateSyncedData: () => Promise<void>
}

const ActiveAccountContext = createContext<ActiveAccountContextValue | null>(null)

const fetcher = async (url: string) => {
  const response = await authFetch(url)
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || "Request failed")
  return data as AccountsResponse
}

function revalidateAccountScopedData() {
  return globalMutate(
    (key) =>
      typeof key === "string" &&
      (key.startsWith("/api/trades") ||
        key.startsWith("/api/analytics") ||
        key.startsWith("/api/accounts")),
    undefined,
    { revalidate: true },
  )
}

export { revalidateAccountScopedData }

export function ActiveAccountProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading, mutate } = useSWR<AccountsResponse>("/api/accounts", fetcher)
  const [switchVersion, setSwitchVersion] = useState(0)

  const activeAccount =
    data?.accounts.find((a) => a.id === data.activeAccountId) ?? data?.accounts[0]

  const switchAccount = useCallback(
    async (accountId: string) => {
      const response = await authFetch("/api/accounts/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "Unable to switch account")

      await mutate()
      setSwitchVersion((value) => value + 1)
      await revalidateAccountScopedData()

      return result
    },
    [mutate],
  )

  const revalidateSyncedData = useCallback(async () => {
    setSwitchVersion((value) => value + 1)
    await revalidateAccountScopedData()
  }, [])

  const value = useMemo<ActiveAccountContextValue>(
    () => ({
      accounts: data?.accounts ?? [],
      activeAccountId: data?.activeAccountId,
      activeAccount,
      isLoading,
      error,
      switchVersion,
      switchAccount,
      refresh: mutate,
      revalidateSyncedData,
    }),
    [data, activeAccount, isLoading, error, switchVersion, switchAccount, mutate, revalidateSyncedData],
  )

  return createElement(ActiveAccountContext.Provider, { value }, children)
}

export function useActiveAccount() {
  const context = useContext(ActiveAccountContext)
  if (!context) {
    throw new Error("useActiveAccount must be used within ActiveAccountProvider")
  }
  return context
}
