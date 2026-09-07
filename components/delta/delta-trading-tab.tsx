"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { RefreshCw, XCircle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { DeltaAccountSelector, type DeltaTradeMode } from "@/components/delta/delta-account-selector"
import { DeltaOrderTicket } from "@/components/delta/delta-order-ticket"
import type { DeltaAccountMarginEntry } from "@/components/delta/use-delta-account-margins"
import {
  DEMO_SYMBOLS,
  deltaApiPath,
  formatPrice,
  formatUsd,
  orderRowPnl,
  pnlClassName,
  type DeltaAccount,
  type DeltaEnvironment,
  type OrderRow,
  type PositionRow,
} from "@/components/delta/delta-shared"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"
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
  positions: PositionRow[]
  orders: OrderRow[]
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
  onRefreshPositions: () => Promise<void>
  onOrderPlaced: () => Promise<void>
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  marginReadyCount?: number
  onRefreshMargins?: () => void
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
  positions,
  orders,
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
  onRefreshPositions,
  onOrderPlaced,
  marginEntries,
  marginReadyCount = 0,
  onRefreshMargins,
}: DeltaTradingTabProps) {
  const { toast } = useToast()

  const targetLabels = useMemo(() => {
    if (tradeMode === "broadcast") {
      return enabledAccounts.filter((a) => broadcastAccountIds.includes(a.id)).map((a) => a.label)
    }
    const one = enabledAccounts.find((a) => a.id === singleAccountId)
    return one ? [one.label] : []
  }, [broadcastAccountIds, enabledAccounts, singleAccountId, tradeMode])

  const unrealizedPnlTotal = useMemo(
    () => positions.reduce((sum, row) => sum + (row.unrealizedPnl ?? 0), 0),
    [positions],
  )

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

  async function closePosition(row: PositionRow) {
    if (!row.accountId || !row.side || row.side === "flat") return
    onBusyChange(`close-${row.accountId}-${row.symbol}`)
    try {
      const response = await authFetch(deltaApiPath("/api/delta/positions/close", environment), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: row.accountId,
          symbol: row.symbol,
          side: row.side,
          size: Math.max(1, Math.floor(row.size)),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Close failed")
      toast({
        title: "Position closed",
        description: `${row.accountLabel} · ${row.symbol}`,
      })
      await onRefreshPositions()
    } catch (error) {
      toast({
        title: "Close failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function closeAllSelected() {
    const ids = tradeMode === "broadcast" ? broadcastAccountIds : singleAccountId ? [singleAccountId] : []
    if (ids.length === 0) {
      toast({ title: "Select account(s) first", variant: "destructive" })
      return
    }
    onBusyChange("close-all")
    try {
      const response = await authFetch(deltaApiPath("/api/delta/positions/close-all", environment), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountIds: ids }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Close all failed")
      toast({
        title: `Closed on ${data.okCount}/${data.total} account(s)`,
        variant: data.okCount === data.total ? "default" : "destructive",
      })
      await onRefreshPositions()
    } catch (error) {
      toast({
        title: "Close all failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Unrealized P&L"
          value={`${unrealizedPnlTotal >= 0 ? "+" : ""}${formatUsd(unrealizedPnlTotal)}`}
          sub="Enabled accounts only"
          valueClass={pnlClassName(unrealizedPnlTotal)}
        />
        <KpiCard label="Open positions" value={String(positions.length)} />
        <KpiCard
          label="Active accounts"
          value={String(enabledAccounts.length)}
          sub={envOverride ? "Env override" : `${accounts.length} total connected`}
        />
        <KpiCard label="Available margin" value={marginDisplay} sub={marginSub} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_1fr]">
        <HudPanel glow="none" className="border-violet-500/20 xl:max-w-md">
          <HudPanelHeader title="Order ticket" />
          <div className="space-y-4 px-5 py-4">
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
            />
          </div>
        </HudPanel>

        <HudPanel>
          <HudPanelHeader
            title="Open positions"
            action={
              <div className="flex gap-2">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!tradingAllowed || busy != null || positions.length === 0}>
                      <XCircle className="mr-1 h-4 w-4" />
                      Close all
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Close all positions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Closes every open position on{" "}
                        {tradeMode === "broadcast"
                          ? `${broadcastAccountIds.length} selected account(s)`
                          : targetLabels[0] ?? "selected account"}
                        .
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void closeAllSelected()}>Close all</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <Button variant="ghost" size="sm" onClick={() => void onRefreshPositions()} disabled={busy != null}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            }
          />
          <div className="overflow-x-auto px-2 pb-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Mark</TableHead>
                  <TableHead>Unrealized PnL</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                      No open positions — place a trade from the ticket
                    </TableCell>
                  </TableRow>
                ) : (
                  positions.map((row) => (
                    <TableRow key={`${row.accountId}-${row.symbol}-${row.side}`}>
                      <TableCell className="text-xs">{row.accountLabel ?? "—"}</TableCell>
                      <TableCell>{row.symbol}</TableCell>
                      <TableCell className={row.side === "long" ? "text-emerald-400" : "text-rose-400"}>
                        {row.side}
                      </TableCell>
                      <TableCell>{row.size}</TableCell>
                      <TableCell>{formatPrice(row.entryPrice)}</TableCell>
                      <TableCell>{formatPrice(row.markPrice)}</TableCell>
                      <TableCell className={pnlClassName(row.unrealizedPnl)}>{formatPrice(row.unrealizedPnl)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-400"
                          disabled={busy != null || !tradingAllowed}
                          onClick={() => void closePosition(row)}
                        >
                          Close
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </HudPanel>
      </div>

      <HudPanel>
        <HudPanelHeader title="Recent orders" />
        <div className="overflow-x-auto px-2 pb-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Entry price</TableHead>
                <TableHead>P&L</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                    No orders yet — your fills will appear here
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((row) => {
                  const pnl = orderRowPnl(row, positions)
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-nowrap text-xs">
                        {row.createdAt ? format(new Date(row.createdAt), "MMM d HH:mm") : "—"}
                      </TableCell>
                      <TableCell className="text-xs">{row.accountLabel ?? "—"}</TableCell>
                      <TableCell>{row.symbol}</TableCell>
                      <TableCell className={row.side === "buy" ? "text-emerald-400" : "text-rose-400"}>
                        {row.side}
                      </TableCell>
                      <TableCell>{row.size}</TableCell>
                      <TableCell>{formatPrice(row.price)}</TableCell>
                      <TableCell className={pnl != null ? pnlClassName(pnl) : "text-muted-foreground"}>
                        {pnl != null ? formatPrice(pnl) : "—"}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </HudPanel>
    </div>
  )
}
