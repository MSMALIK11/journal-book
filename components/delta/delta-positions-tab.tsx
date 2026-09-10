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
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import type { DeltaTradeMode } from "@/components/delta/delta-account-selector"
import {
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

type DeltaPositionsTabProps = {
  environment: DeltaEnvironment
  enabledAccounts: DeltaAccount[]
  tradingAllowed: boolean
  positions: PositionRow[]
  orders: OrderRow[]
  busy: string | null
  onBusyChange: (busy: string | null) => void
  tradeMode: DeltaTradeMode
  singleAccountId: string | null
  broadcastAccountIds: string[]
  onRefreshPositions: () => Promise<void>
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

export function DeltaPositionsTab({
  environment,
  enabledAccounts,
  tradingAllowed,
  positions,
  orders,
  busy,
  onBusyChange,
  tradeMode,
  singleAccountId,
  broadcastAccountIds,
  onRefreshPositions,
}: DeltaPositionsTabProps) {
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

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label="Unrealized P&L"
          value={`${unrealizedPnlTotal >= 0 ? "+" : ""}${formatUsd(unrealizedPnlTotal)}`}
          sub="Enabled accounts only"
          valueClass={pnlClassName(unrealizedPnlTotal)}
        />
        <KpiCard label="Open positions" value={String(positions.length)} />
      </div>

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
                    No open positions — place a trade from Configuration
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
