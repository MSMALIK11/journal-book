"use client"

import { useMemo } from "react"
import { Label } from "@/components/ui/label"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { DeltaAccountSelector, type DeltaTradeMode } from "@/components/delta/delta-account-selector"
import { DeltaOrderTicket } from "@/components/delta/delta-order-ticket"
import type { DeltaAccountMarginEntry } from "@/components/delta/use-delta-account-margins"
import {
  DEMO_SYMBOLS,
  formatUsd,
  type DeltaAccount,
  type DeltaEnvironment,
} from "@/components/delta/delta-shared"
import { cn } from "@/lib/utils"

type DeltaTradingTabProps = {
  environment: DeltaEnvironment
  accounts: DeltaAccount[]
  enabledAccounts: DeltaAccount[]
  configured: boolean
  tradingAllowed: boolean
  serverLiveBlocked: boolean
  envOverride: boolean
  maxOrderSize: number
  symbol: (typeof DEMO_SYMBOLS)[number]
  onSymbolChange: (symbol: (typeof DEMO_SYMBOLS)[number]) => void
  busy: string | null
  onBusyChange: (busy: string | null) => void
  tradeMode: DeltaTradeMode
  singleAccountId: string | null
  broadcastAccountIds: string[]
  onTradeModeChange: (mode: DeltaTradeMode) => void
  onSingleAccountChange: (accountId: string | null) => void
  onBroadcastAccountIdsChange: (ids: string[]) => void
  onOrderPlaced: () => Promise<void>
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  marginReadyCount?: number
  onRefreshMargins?: () => void
  persistReady?: boolean
}

function KpiCard({ label, value, sub, valueClass }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <HudPanel glow="none" className="border-border/60">
      <div className="px-4 py-3">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-lg font-semibold tabular-nums", valueClass)}>{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
      </div>
    </HudPanel>
  )
}

export function DeltaTradingTab({
  environment,
  accounts,
  enabledAccounts,
  configured,
  tradingAllowed,
  serverLiveBlocked,
  envOverride,
  maxOrderSize,
  symbol,
  onSymbolChange,
  busy,
  onBusyChange,
  tradeMode,
  singleAccountId,
  broadcastAccountIds,
  onTradeModeChange,
  onSingleAccountChange,
  onBroadcastAccountIdsChange,
  onOrderPlaced,
  marginEntries,
  marginReadyCount = 0,
  onRefreshMargins,
  persistReady = true,
}: DeltaTradingTabProps) {
  const targetLabels = useMemo(() => {
    if (tradeMode === "broadcast") {
      return enabledAccounts.filter((a) => broadcastAccountIds.includes(a.id)).map((a) => a.label)
    }
    const one = enabledAccounts.find((a) => a.id === singleAccountId)
    return one ? [one.label] : []
  }, [broadcastAccountIds, enabledAccounts, singleAccountId, tradeMode])

  const singleMargin = singleAccountId ? marginEntries?.[singleAccountId]?.marginUsd ?? null : null
  const broadcastMargins = useMemo(() => {
    if (tradeMode !== "broadcast") return []
    return broadcastAccountIds
      .map((id) => marginEntries?.[id])
      .filter(Boolean) as DeltaAccountMarginEntry[]
  }, [broadcastAccountIds, marginEntries, tradeMode])

  const minBroadcastMargin = useMemo(() => {
    const funded = broadcastMargins.filter((entry) => (entry.marginUsd ?? 0) > 0)
    if (funded.length === 0) return null
    return funded.reduce((min, cur) => ((cur.marginUsd ?? 0) < (min.marginUsd ?? 0) ? cur : min), funded[0])
  }, [broadcastMargins])

  const marginEntriesInScope =
    tradeMode === "broadcast"
      ? broadcastMargins
      : singleAccountId && marginEntries?.[singleAccountId]
        ? [marginEntries[singleAccountId]]
        : []
  const marginBlockedCount = marginEntriesInScope.filter((entry) => entry.error).length
  const marginStillLoading = marginEntriesInScope.some((entry) => entry.loading)

  const marginDisplay =
    tradeMode === "broadcast"
      ? minBroadcastMargin
        ? `${formatUsd(minBroadcastMargin.marginUsd ?? 0)} USD min · ${marginReadyCount}/${broadcastAccountIds.length}`
        : broadcastAccountIds.length === 0
          ? "Select accounts"
          : marginBlockedCount > 0
            ? "Wallet blocked"
            : marginStillLoading
              ? "Loading…"
              : "—"
      : singleMargin != null
        ? `${formatUsd(singleMargin)} USD`
        : !configured
          ? "—"
          : marginBlockedCount > 0
            ? "Wallet blocked"
            : marginStillLoading
              ? "Loading…"
              : "—"

  const marginSub =
    marginBlockedCount > 0
      ? "Check API key IP whitelist"
      : tradeMode === "broadcast"
        ? "Broadcast mode"
        : "Selected account"

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Active accounts"
          value={String(enabledAccounts.length)}
          sub={envOverride ? "Env override" : `${accounts.length} total connected`}
        />
        <KpiCard label="Available margin" value={marginDisplay} sub={marginSub} />
      </div>

      <HudPanel glow="none" className="border-violet-500/20">
        <HudPanelHeader title="Order ticket" />
        <div className="grid gap-5 px-5 py-4 xl:grid-cols-[minmax(0,18rem)_1fr] xl:items-start">
          <div className="space-y-4">
            <DeltaAccountSelector
              environment={environment}
              accounts={enabledAccounts}
              allAccountsCount={accounts.length}
              mode={tradeMode}
              singleAccountId={singleAccountId}
              broadcastAccountIds={broadcastAccountIds}
              marginEntries={marginEntries}
              onModeChange={onTradeModeChange}
              onSingleAccountChange={onSingleAccountChange}
              onBroadcastAccountIdsChange={onBroadcastAccountIdsChange}
              skipLocalHydrate={persistReady}
            />
            <div className="grid gap-2">
              <Label>Symbol</Label>
              <select
                value={symbol}
                onChange={(e) => onSymbolChange(e.target.value as (typeof DEMO_SYMBOLS)[number])}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={!tradingAllowed}
              >
                {DEMO_SYMBOLS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DeltaOrderTicket
            environment={environment}
            symbol={symbol}
            configured={configured}
            tradingAllowed={tradingAllowed}
            serverLiveBlocked={serverLiveBlocked}
            maxOrderSize={maxOrderSize}
            tradeMode={tradeMode}
            accountId={singleAccountId}
            accountIds={broadcastAccountIds}
            targetLabels={targetLabels}
            marginEntries={marginEntries}
            marginReadyCount={marginReadyCount}
            onRefreshMargins={onRefreshMargins}
            busy={busy}
            onBusyChange={onBusyChange}
            onOrderPlaced={() => void onOrderPlaced()}
            persistReady={persistReady}
          />
        </div>
      </HudPanel>
    </div>
  )
}
