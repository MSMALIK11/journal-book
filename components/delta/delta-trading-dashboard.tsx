"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { NeonPulseLoader } from "@/components/ui/neon-pulse-loader"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DeltaIntegrationsTab } from "@/components/delta/delta-integrations-tab"
import { DeltaPerAccountTrades } from "@/components/delta/delta-per-account-trades"
import { DeltaPositionsTab } from "@/components/delta/delta-positions-tab"
import {
  loadDeltaBroadcastAccountIds,
  loadDeltaSingleAccountId,
  loadDeltaTradeMode,
  type DeltaTradeMode,
} from "@/components/delta/delta-account-selector"
import { DeltaTradingTab } from "@/components/delta/delta-trading-tab"
import { useDeltaAccountMargins } from "@/components/delta/use-delta-account-margins"
import {
  prefetchDeltaMarketData,
  refreshDeltaDashboard,
  useDeltaAccounts,
  useDeltaOrders,
  useDeltaPositions,
  useDerivedDeltaAccountActivity,
} from "@/components/delta/use-delta-dashboard-data"
import {
  deltaActiveTabKey,
  deltaApiPath,
  DEMO_SYMBOLS,
  type DeltaAccount,
  type DeltaEnvironment,
} from "@/components/delta/delta-shared"
import { authFetch } from "@/lib/client-auth"
import { persistAutoTradeRouting } from "@/lib/delta/persist-auto-trade-client"
import {
  isDeltaAutoTradeSymbol,
  type DeltaAutoTradeConfig,
} from "@/lib/delta/auto-trade-settings"
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
  const [configReady, setConfigReady] = useState(false)
  const [userLiveEnabled, setUserLiveEnabled] = useState(false)
  const [liveSettingsLoading, setLiveSettingsLoading] = useState(isLive)
  const syncedAccountsRef = useRef(false)
  const serverRoutingLoadedRef = useRef(false)
  const routingPersistTimerRef = useRef<number | null>(null)
  const skipRoutingPersistRef = useRef(true)
  const [routingSyncing, setRoutingSyncing] = useState(false)

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
  /** Load positions/activity for every connected account (even if all are disabled). */
  const brokerDataReady = envOverride || accounts.length > 0

  const {
    data: positionsData,
    isLoading: positionsLoading,
    mutate: mutatePositions,
  } = useDeltaPositions(environment, brokerDataReady)

  const {
    data: ordersData,
    isLoading: ordersLoading,
    mutate: mutateOrders,
  } = useDeltaOrders(environment, brokerDataReady)

  const positions = positionsData?.positions ?? []
  const orders = ordersData?.orders ?? []
  const accountActivity = useDerivedDeltaAccountActivity(
    accounts,
    envOverride,
    environment,
    positions,
    orders,
    positionsData?.accounts,
  )
  const brokerDataLoading = positionsLoading || ordersLoading

  const accountMargins = useDeltaAccountMargins(environment, enabledAccountIds, {
    enabled: configured && enabledAccountIds.length > 0,
  })

  const tradingAllowed = !serverLiveBlocked && configured && (!isLive || userLiveEnabled)
  const loading = accountsLoading && !accountsData

  useEffect(() => {
    if (!isLive) {
      setUserLiveEnabled(true)
      setLiveSettingsLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      setLiveSettingsLoading(true)
      try {
        const response = await authFetch("/api/delta/live-settings")
        const data = await response.json()
        if (!cancelled && response.ok) setUserLiveEnabled(Boolean(data.enabled))
      } catch {
        if (!cancelled) setUserLiveEnabled(false)
      } finally {
        if (!cancelled) setLiveSettingsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isLive])

  async function toggleUserLiveTrading(enabled: boolean) {
    setLiveSettingsLoading(true)
    try {
      const response = await authFetch("/api/delta/live-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to update live trading")
      setUserLiveEnabled(Boolean(data.enabled))
      toast({
        title: data.enabled ? "Live trading enabled" : "Live trading disabled",
        description: data.enabled
          ? "Orders and auto-trade can now run on Delta live."
          : "Live orders and auto-trade are paused.",
      })
    } catch (error) {
      toast({
        title: "Could not update live trading",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setLiveSettingsLoading(false)
    }
  }

  // Warm every tradable symbol once so the order ticket never waits on a fetch.
  const prefetchAccountId =
    tradeMode === "single" ? singleAccountId : broadcastAccountIds[0] ?? null

  useEffect(() => {
    if (!configured) return
    prefetchDeltaMarketData(environment, DEMO_SYMBOLS, prefetchAccountId)
  }, [configured, environment, prefetchAccountId])

  useEffect(() => {
    let cancelled = false
    syncedAccountsRef.current = false
    serverRoutingLoadedRef.current = false
    skipRoutingPersistRef.current = true
    setConfigReady(false)
    void (async () => {
      try {
        const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment))
        const data = await response.json()
        if (cancelled) return
        if (response.ok && data.config) {
          const config = data.config as DeltaAutoTradeConfig
          serverRoutingLoadedRef.current = true
          setTradeMode(config.tradeMode)
          if (isDeltaAutoTradeSymbol(config.symbol) && (DEMO_SYMBOLS as readonly string[]).includes(config.symbol)) {
            setSymbol(config.symbol as (typeof DEMO_SYMBOLS)[number])
          }
          if (config.singleAccountId) setSingleAccountId(config.singleAccountId)
          if (config.tradeMode === "broadcast") {
            setBroadcastAccountIds(
              (config.broadcastAccountIds?.length ?? 0) > 0
                ? config.broadcastAccountIds ?? []
                : enabledAccounts.map((a) => a.id),
            )
          }
        } else {
          setTradeMode(loadDeltaTradeMode(environment))
        }
      } catch {
        if (!cancelled) setTradeMode(loadDeltaTradeMode(environment))
      } finally {
        if (!cancelled) setConfigReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [environment])

  useEffect(() => {
    if (!configReady || enabledAccounts.length === 0 || syncedAccountsRef.current) return
    syncedAccountsRef.current = true
    setSingleAccountId((prev) => {
      if (prev && enabledAccounts.some((account) => account.id === prev)) return prev
      return loadDeltaSingleAccountId(enabledAccounts, environment)
    })
    setBroadcastAccountIds((prev) => {
      const valid = prev.filter((id) => enabledAccounts.some((account) => account.id === id))
      if (serverRoutingLoadedRef.current) {
        return valid.length > 0 ? valid : enabledAccounts.map((a) => a.id)
      }
      if (valid.length > 0) return valid
      return loadDeltaBroadcastAccountIds(enabledAccounts, environment)
    })
  }, [configReady, enabledAccounts, environment])

  useEffect(() => {
    if (!configReady || !brokerDataReady) return
    if (skipRoutingPersistRef.current) {
      skipRoutingPersistRef.current = false
      return
    }
    if (routingPersistTimerRef.current != null) {
      window.clearTimeout(routingPersistTimerRef.current)
    }
    routingPersistTimerRef.current = window.setTimeout(() => {
      setRoutingSyncing(true)
      void persistAutoTradeRouting(environment, {
        tradeMode,
        singleAccountId,
        broadcastAccountIds,
      })
        .then(() => {
          serverRoutingLoadedRef.current = true
        })
        .catch((error) => {
          toast({
            title: "Could not save broadcast settings",
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive",
          })
        })
        .finally(() => setRoutingSyncing(false))
    }, 500)
    return () => {
      if (routingPersistTimerRef.current != null) {
        window.clearTimeout(routingPersistTimerRef.current)
      }
    }
  }, [configReady, brokerDataReady, environment, tradeMode, singleAccountId, broadcastAccountIds, toast])

  const tabStorageKey = deltaActiveTabKey(environment)

  useEffect(() => {
    const saved = localStorage.getItem(tabStorageKey)
    if (
      saved === "integrations" ||
      saved === "by-account" ||
      saved === "trading" ||
      saved === "positions"
    ) {
      setActiveTab(saved)
    }
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
    try {
      const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment))
      const data = await response.json()
      if (response.ok && data.config?.tradeMode === "broadcast") {
        setBroadcastAccountIds(data.config.broadcastAccountIds ?? [])
      }
    } catch {
      /* best-effort sync after account change */
    }
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

      {isLive && envOverride ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200">
          Server env override is active — all live orders use one API key, not your selected accounts.
        </div>
      ) : null}

      {isLive && !serverLiveBlocked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-500/25 bg-rose-500/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-rose-100">Live trading arm</p>
            <p className="text-xs text-muted-foreground">
              {userLiveEnabled
                ? "Real orders and auto-trade are allowed on production."
                : "Enable before placing live orders or turning on auto-trade."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{userLiveEnabled ? "Armed" : "Disarmed"}</span>
            <Switch
              checked={userLiveEnabled}
              disabled={liveSettingsLoading}
              onCheckedChange={(checked) => void toggleUserLiveTrading(checked)}
              className={cn(userLiveEnabled && "data-[state=checked]:bg-rose-600")}
            />
          </div>
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
            {brokerDataLoading ? (
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
        <TabsList className="inline-flex h-10 w-full max-w-3xl flex-wrap gap-1 rounded-lg border border-border/60 bg-muted/10 p-1">
          <TabsTrigger
            value="integrations"
            className="flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            Accounts
          </TabsTrigger>
          <TabsTrigger
            value="by-account"
            className="relative flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            By account
            {accountActivity.some((a) => a.hasOpenPosition) ? (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-medium text-white">
                {accountActivity.filter((a) => a.hasOpenPosition).length}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="trading"
            className="flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            Configuration
          </TabsTrigger>
          <TabsTrigger
            value="positions"
            className="flex-1 rounded-md text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm"
          >
            Positions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="by-account" className="mt-0">
          <DeltaPerAccountTrades
            accounts={accountActivity}
            loading={brokerDataLoading}
            positionsForPnl={positions}
            refreshing={brokerDataLoading}
            onRefresh={async () => {
              await Promise.all([mutatePositions(), mutateOrders()])
            }}
          />
        </TabsContent>

        <TabsContent value="integrations" className="mt-0">
          <DeltaIntegrationsTab
            environment={environment}
            accounts={accounts}
            envOverride={envOverride}
            maxAccounts={maxAccounts}
            busy={busy}
            onBusyChange={setBusy}
            marginEntries={accountMargins.entries}
            accountActivity={accountActivity}
            onViewAccountTrades={() => setActiveTab("by-account")}
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
            onOrderPlaced={async () => {
              await handleOrderPlaced()
            }}
            marginEntries={accountMargins.entries}
            marginReadyCount={accountMargins.readyCount}
            onRefreshMargins={accountMargins.refresh}
            persistReady={configReady}
            routingSyncing={routingSyncing}
          />
        </TabsContent>

        <TabsContent value="positions" className="mt-0 space-y-6">
          <DeltaPositionsTab
            environment={environment}
            enabledAccounts={enabledAccounts}
            tradingAllowed={tradingAllowed}
            positions={positions}
            orders={orders}
            busy={busy}
            onBusyChange={setBusy}
            tradeMode={tradeMode}
            singleAccountId={singleAccountId}
            broadcastAccountIds={broadcastAccountIds}
            onRefreshPositions={async () => {
              await Promise.all([mutatePositions(), mutateOrders()])
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
