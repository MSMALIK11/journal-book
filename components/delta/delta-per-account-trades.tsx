"use client"

import { useEffect, useMemo, useState } from "react"
import { format } from "date-fns"
import { ChevronDown, RefreshCw, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import {
  findOpenPositionForOrder,
  formatPrice,
  formatSignedUsd,
  pnlClassName,
  type OrderRow,
  type PositionRow,
} from "@/components/delta/delta-shared"
import type { DeltaAccountActivityRow } from "@/lib/delta/account-activity"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

type DeltaPerAccountTradesProps = {
  accounts: DeltaAccountActivityRow[]
  loading?: boolean
  positionsForPnl: PositionRow[]
  onRefresh?: () => void | Promise<void>
  refreshing?: boolean
}

function AccountTradeBlock({
  row,
  expanded,
  onToggle,
  positionsForPnl,
}: {
  row: DeltaAccountActivityRow
  expanded: boolean
  onToggle: () => void
  positionsForPnl: PositionRow[]
}) {
  return (
    <div
      className={cn(
        "rounded-xl border transition-colors",
        row.hasOpenPosition ? "border-emerald-400/25 bg-emerald-500/[0.04]" : "border-border/60 bg-[#0c0d12]",
        !row.enabled && "opacity-85",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold text-foreground">{row.label}</span>
            {row.hasOpenPosition ? (
              <Badge className="h-5 bg-emerald-600/90 px-1.5 text-[10px] hover:bg-emerald-600/90">Live trade</Badge>
            ) : (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal text-muted-foreground">
                Flat
              </Badge>
            )}
            {!row.enabled ? (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                Disabled
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {row.openPositionCount} open · {row.recentOrderCount} recent orders
            {row.lastOrderAt ? ` · last ${format(new Date(row.lastOrderAt), "MMM d HH:mm")}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unrealized</p>
          <p className={cn("text-lg font-semibold tabular-nums", pnlClassName(row.unrealizedPnl))}>
            {row.hasOpenPosition ? formatSignedUsd(row.unrealizedPnl) : "—"}
          </p>
        </div>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-border/40 px-4 pb-4 pt-3">
          {row.error ? (
            <p className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-xs text-rose-300">
              Could not sync positions: {row.error}
            </p>
          ) : null}

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Active trades</p>
            {row.positions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border/50 px-3 py-3 text-sm text-muted-foreground">
                No open position on this account right now.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>Mark</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.positions.map((pos) => (
                    <TableRow key={`${pos.symbol}-${pos.side}`}>
                      <TableCell className="font-medium">{pos.symbol}</TableCell>
                      <TableCell className={pos.side === "long" ? "text-emerald-400" : "text-rose-400"}>
                        {pos.side}
                      </TableCell>
                      <TableCell>{pos.size}</TableCell>
                      <TableCell className="tabular-nums">{formatPrice(pos.entryPrice)}</TableCell>
                      <TableCell className="tabular-nums">{formatPrice(pos.markPrice)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", pnlClassName(pos.unrealizedPnl))}>
                        {formatSignedUsd(pos.unrealizedPnl)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recent fills</p>
            {row.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No orders logged yet for this account.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Fill</TableHead>
                    <TableHead>Src</TableHead>
                    <TableHead className="text-right">Open leg P&L</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {row.recentOrders.slice(0, 15).map((order) => {
                    const openLeg = findOpenPositionForOrder(order as OrderRow, positionsForPnl)
                    const pnl = openLeg?.unrealizedPnl
                    return (
                      <TableRow key={order.id}>
                        <TableCell className="whitespace-nowrap text-xs">
                          {order.createdAt ? format(new Date(order.createdAt), "MMM d HH:mm") : "—"}
                        </TableCell>
                        <TableCell>{order.symbol}</TableCell>
                        <TableCell className={order.side === "buy" ? "text-emerald-400" : "text-rose-400"}>
                          {order.side}
                        </TableCell>
                        <TableCell>{order.size}</TableCell>
                        <TableCell className="tabular-nums">{formatPrice(order.price)}</TableCell>
                        <TableCell className="text-xs capitalize text-muted-foreground">{order.source ?? "manual"}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right tabular-nums",
                            pnl != null ? pnlClassName(pnl) : "text-muted-foreground",
                          )}
                        >
                          {pnl != null ? formatSignedUsd(pnl) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function DeltaPerAccountTrades({
  accounts,
  loading,
  positionsForPnl,
  onRefresh,
  refreshing,
}: DeltaPerAccountTradesProps) {
  const activeIds = useMemo(
    () => new Set(accounts.filter((a) => a.hasOpenPosition).map((a) => a.accountId)),
    [accounts],
  )

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const id of activeIds) next.add(id)
      return next
    })
  }, [activeIds])

  const totalUnrealized = accounts.reduce((sum, a) => sum + a.unrealizedPnl, 0)
  const activeCount = activeIds.size

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(accounts.map((a) => a.accountId)))
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <HudPanel glow="none" className="border-border/60">
          <div className="flex items-center gap-3 px-4 py-3">
            <TrendingUp className="h-5 w-5 text-emerald-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Accounts w/ trade</p>
              <p className="text-xl font-semibold tabular-nums">{activeCount}</p>
            </div>
          </div>
        </HudPanel>
        <HudPanel glow="none" className="border-border/60">
          <div className="flex items-center gap-3 px-4 py-3">
            <TrendingDown className="h-5 w-5 text-cyan-400" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Connected accounts</p>
              <p className="text-xl font-semibold tabular-nums">{accounts.length}</p>
            </div>
          </div>
        </HudPanel>
        <HudPanel glow="none" className="border-border/60">
          <div className="px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total unrealized</p>
            <p className={cn("text-xl font-semibold tabular-nums", pnlClassName(totalUnrealized))}>
              {formatSignedUsd(totalUnrealized)}
            </p>
          </div>
        </HudPanel>
      </div>

      <HudPanel>
        <HudPanelHeader
          title="Every account — active trades & P&L"
          description="Expand any account to see open positions, entry/mark, and recent fills. Accounts with a live trade auto-expand."
          action={
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={expandAll}>
                Expand all
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={collapseAll}>
                Collapse
              </Button>
              {onRefresh ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={refreshing}
                  onClick={() => void onRefresh()}
                >
                  <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
                  Refresh
                </Button>
              ) : null}
            </div>
          }
        />
        <div className="space-y-2 px-4 pb-4">
          {loading && accounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading per-account trades…</p>
          ) : accounts.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Add Delta accounts on the Accounts tab, then return here.
            </p>
          ) : (
            accounts.map((row) => (
              <AccountTradeBlock
                key={row.accountId}
                row={row}
                expanded={expanded.has(row.accountId)}
                onToggle={() => toggle(row.accountId)}
                positionsForPnl={positionsForPnl}
              />
            ))
          )}
        </div>
      </HudPanel>
    </div>
  )
}
