"use client"

import { useEffect, useMemo, useState } from "react"
import { RefreshCw } from "lucide-react"
import { NeonPulseLoader } from "@/components/ui/neon-pulse-loader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DeltaIntegrationsTab } from "@/components/delta/delta-integrations-tab"
import { type DeltaTradeMode } from "@/components/delta/delta-account-selector"
import { DeltaTradingTab } from "@/components/delta/delta-trading-tab"
import { useDeltaAccountMargins } from "@/components/delta/use-delta-account-margins"
import {
  prefetchDeltaMarketData,
  refreshDeltaDashboard,
  useDeltaAccounts,
  useDeltaOrders,
  useDeltaPositions,
} from "@/components/delta/use-delta-dashboard-data"
import {
  deltaActiveTabKey,
  DEMO_SYMBOLS,
  type DeltaAccount,
  type DeltaEnvironment,
} from "@/components/delta/delta-shared"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

type DeltaTradingDashboardProps = {
  environment?: DeltaEnvironment
}

export function DeltaTradingDashboard({ environment = "demo" }: DeltaTradingDashboardProps) {
  const isLive = environment === "live"
  const { toast } = useToast()
  const [activeTab, setActiveTab] = useState("integrations")
  const [symbol, setSymbol] = useState<(typeof DEMO_SYMBOLS)[number]>("BTCUSD")
  const [busy, setBusy] = useState<string | null>(null)
  const [tradeMode, setTradeMode] = useState<DeltaTradeMode>("single")
  const [singleAccountId, setSingleAccountId] = useState<string | null>(null)
  const [broadcastAccountIds, setBroadcastAccountIds] = useState<string[]>([])

  const {
    data: accountsData,
    error: accountsError,
    isLoading: accountsLoading,
    mutate: mutateAccounts,
  } = useDeltaAccounts(environment)

  const accounts = accountsData?.accounts ?? []
  const envOverride = Boolean(accountsData?.envOverride)
  const serverLiveBlocked = Boolean(accountsData?.serverLiveBlocked)
  const maxOrderSize = accountsData?.maxOrderSize ?? (isLive ? 5 : 100)
  const maxAccounts = accountsData?.maxAccounts ?? 10

  const enabledAccounts = useMemo(() => accounts.filter((a) => a.enabled), [accounts])
  const enabledAccountIds = useMemo(() => enabledAccounts.map((a) => a.id), [enabledAccounts])
  const configured = envOverride || enabledAccounts.length > 0

  const {
    data: positionsData,
    isLoading: positionsLoading,
    mutate: mutatePositions,
  } = useDeltaPositions(environment, configured)

  const {
    data: ordersData,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useDeltaOrders(environment, configured)

  const positions = positionsData?.positions ?? []
  const orders = ordersData?.orders ?? []

  const accountMargins = useDeltaAccountMargins(environment, enabledAccountIds, {
    enabled: configured && enabledAccountIds.length > 0,
  })

  const tradingAllowed = !serverLiveBlocked && configured
  const loading = accountsLoading && !accountsData

  // Warm every tradable symbol once so the order ticket never waits on a fetch.
  const prefetchAccountId =
    tradeMode === "single" ? singleAccountId : broadcastAccountIds[0] ?? null

  useEffect(() => {
    if (!configured) return
    prefetchDeltaMarketData(environment, DEMO_SYMBOLS, prefetchAccountId)
  }, [configured, environment, prefetchAccountId])

  const tabStorageKey = deltaActiveTabKey(environment)

  useEffect(() => {
    const saved = localStorage.getItem(tabStorageKey)
    if (saved === "integrations" || saved === "trading") setActiveTab(saved)
  }, [tabStorageKey])

  useEffect(() => {
    localStorage.setItem(tabStorageKey, activeTab)
  }, [activeTab, tabStorageKey])

  useEffect(() => {
    if (!accountsError) return
    toast({
      title: "Could not load Delta page",
      description: accountsError instanceof Error ? accountsError.message : "Unknown error",
      variant: "destructive",
    })
  }, [accountsError, toast])

  async function refreshAll() {
    setBusy("refresh")
    try {
      await refreshDeltaDashboard(environment, enabledAccountIds)
      accountMargins.refresh()
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setBusy(null)
    }
  }

  async function handleAccountsChange(nextAccounts?: DeltaAccount[]) {
    if (nextAccounts) {
      await mutateAccounts(
        accountsData
          ? { ...accountsData, accounts: nextAccounts }
          : { accounts: nextAccounts },
        { revalidate: false },
      )
    } else {
      await mutateAccounts()
    }

    const next = nextAccounts ?? accounts
    const enabled = next.filter((a: DeltaAccount) => a.enabled)
    if (singleAccountId && !enabled.some((a: DeltaAccount) => a.id === singleAccountId)) {
      setSingleAccountId(enabled.find((a: DeltaAccount) => a.isDefault)?.id ?? enabled[0]?.id ?? null)
    }
    setBroadcastAccountIds((prev) => prev.filter((id) => enabled.some((a: DeltaAccount) => a.id === id)))

    const ids = enabled.map((a) => a.id)
    await refreshDeltaDashboard(environment, ids)
    accountMargins.refresh()
  }

  async function handleOrderPlaced() {
    await refreshDeltaDashboard(environment, enabledAccountIds)
    accountMargins.refresh()
  }

  if (loading) {
    return (
      <NeonPulseLoader
        status={`CONNECTING ${isLive ? "LIVE" : "DEMO"}...`}
        fullScreen
      />
    )
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 lg:p-6">
      {isLive && serverLiveBlocked ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-2.5 text-xs text-rose-300">
          Live trading is blocked on this server (DELTA_LIVE_ENABLED=false).
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Delta {isLive ? "Live" : "Demo"}
            </h1>
            <Badge
              variant="outline"
              className={cn(
                "font-normal",
                isLive ? "border-rose-400/35 text-rose-300" : "border-amber-400/35 text-amber-300",
              )}
            >
              {isLive ? "Production" : "Testnet"}
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-1 tabular-nums">
              {accounts.length} connected
            </span>
            <span className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-1 tabular-nums">
              {enabledAccounts.length} enabled
            </span>
            <span className="rounded-md border border-border/60 bg-muted/10 px-2.5 py-1 tabular-nums">
              {maxOrderSize} lot max
            </span>
            {positionsLoading || ordersLoading ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Syncing…</span>
            ) : null}
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refreshAll()} disabled={busy === "refresh"}>
          <RefreshCw className={cn("mr-2 h-4 w-4", busy === "refresh" && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6">
        <TabsList className="inline-flex h-10 w-full max-w-md rounded-lg border border-border/60 bg-muted/10 p-1">
          <TabsTrigger
            value="integrations"
            className="flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            Accounts
          </TabsTrigger>
          <TabsTrigger
            value="trading"
            className="flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            Trading
          </TabsTrigger>
        </TabsList>

        <TabsContent value="integrations" className="mt-0">
          <DeltaIntegrationsTab
            environment={environment}
            accounts={accounts}
            envOverride={envOverride}
            maxAccounts={maxAccounts}
            busy={busy}
            onBusyChange={setBusy}
            marginEntries={accountMargins.entries}
            onAccountsChange={(accounts) => {
              void handleAccountsChange(accounts).catch((error) => {
                toast({
                  title: "Account update failed",
                  description: error instanceof Error ? error.message : "Unknown error",
                  variant: "destructive",
                })
              })
            }}
          />
        </TabsContent>

        <TabsContent value="trading" className="mt-0">
          <DeltaTradingTab
            environment={environment}
            accounts={accounts}
            enabledAccounts={enabledAccounts}
            configured={configured}
            tradingAllowed={tradingAllowed}
            serverLiveBlocked={serverLiveBlocked}
            envOverride={envOverride}
            maxOrderSize={maxOrderSize}
            positions={positions}
            orders={orders}
            symbol={symbol}
            onSymbolChange={setSymbol}
            busy={busy}
            onBusyChange={setBusy}
            tradeMode={tradeMode}
            singleAccountId={singleAccountId}
            broadcastAccountIds={broadcastAccountIds}
            onTradeModeChange={setTradeMode}
            onSingleAccountChange={setSingleAccountId}
            onBroadcastAccountIdsChange={setBroadcastAccountIds}
            onRefreshPositions={async () => {
              await mutatePositions()
            }}
            onOrderPlaced={async () => {
              await handleOrderPlaced()
            }}
            marginEntries={accountMargins.entries}
            marginReadyCount={accountMargins.readyCount}
            onRefreshMargins={accountMargins.refresh}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
