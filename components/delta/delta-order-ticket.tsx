"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, ChevronDown, ChevronUp, Loader2, RefreshCw } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { useDeltaAutoTradeSync } from "@/components/delta/use-delta-auto-trade-sync"
import {
  formatMarginUsd,
  isLowMargin,
  type DeltaAccountMarginEntry,
} from "@/components/delta/use-delta-account-margins"
import { useDeltaMarketData } from "@/components/delta/use-delta-dashboard-data"
import { authFetch } from "@/lib/client-auth"
import {
  computeOrderTicketLots,
  DELTA_LEVERAGE_STEPS,
  lotsToUnderlying,
  marginRequiredUsd,
  nearestLeverageStep,
  type DeltaProductInfo,
} from "@/lib/broker/delta-product"
import type { DeltaTradeMode } from "@/components/delta/delta-account-selector"
import { deltaApiPath, type DeltaEnvironment } from "@/components/delta/delta-shared"
import {
  DELTA_AUTO_TRADE_SYMBOLS,
  type DeltaAutoTradeSymbol,
} from "@/lib/delta/auto-trade-settings"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

const SIZE_PCTS = [10, 25, 50, 75, 100] as const

type DeltaOrderTicketProps = {
  environment: DeltaEnvironment
  symbol: string
  configured: boolean
  tradingAllowed: boolean
  serverLiveBlocked: boolean
  maxOrderSize: number
  tradeMode: DeltaTradeMode
  accountId: string | null
  accountIds: string[]
  targetLabels: string[]
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  marginReadyCount?: number
  onRefreshMargins?: () => void
  busy: string | null
  onBusyChange: (busy: string | null) => void
  onOrderPlaced: () => void
  persistReady?: boolean
}

function formatUsd(value: number) {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatUnderlying(value: number, unit: string) {
  const digits = unit === "BTC" ? 4 : 3
  return `~${value.toFixed(digits)} ${unit}`
}

export function DeltaOrderTicket({
  environment,
  symbol,
  configured,
  tradingAllowed,
  serverLiveBlocked,
  maxOrderSize,
  tradeMode,
  accountId,
  accountIds,
  targetLabels,
  marginEntries,
  marginReadyCount = 0,
  onRefreshMargins,
  busy,
  onBusyChange,
  onOrderPlaced,
  persistReady = true,
}: DeltaOrderTicketProps) {
  const { toast } = useToast()
  const [orderType, setOrderType] = useState<"market" | "limit">("market")
  const [lots, setLots] = useState(1)
  const [selectedPct, setSelectedPct] = useState<number | null>(null)
  const [leverageOpen, setLeverageOpen] = useState(false)
  const [leverage, setLeverage] = useState(10)
  const [pendingLeverage, setPendingLeverage] = useState(10)
  const [availableMargin, setAvailableMargin] = useState<number | null>(null)
  const [broadcastMargin, setBroadcastMargin] = useState<{
    minMarginUsd: number
    accountCount: number
    limitingLabel: string
  } | null>(null)
  const [confirmSide, setConfirmSide] = useState<"buy" | "sell" | null>(null)
  const [liveConfirmText, setLiveConfirmText] = useState("")

  const isLive = environment === "live"
  const accountIdsKey = accountIds.join(",")

  // Market data is shared/cached via SWR — switching symbol or account reuses the warm copy.
  const leverageAccountId =
    tradeMode === "single" ? accountId : accountIds.length > 0 ? accountIds[0] : null

  const {
    data: marketData,
    error: marketError,
    isLoading: marketLoading,
    isValidating: marketValidating,
    mutate: mutateMarketData,
  } = useDeltaMarketData(environment, symbol, leverageAccountId, configured)

  const product = marketData?.product ?? null
  const markPrice = marketData?.markPrice ?? marketData?.product.markPrice ?? null
  const apiLeverage = marketData?.product.leverage ?? marketData?.product.defaultLeverage ?? null
  const orderSizeCap =
    typeof marketData?.maxOrderSize === "number" && marketData.maxOrderSize > 0
      ? marketData.maxOrderSize
      : maxOrderSize
  const loadingMarket = marketLoading || marketValidating

  const loadMarketData = useCallback(async () => {
    await mutateMarketData()
  }, [mutateMarketData])

  useEffect(() => {
    if (!marketError) return
    toast({
      title: "Market data unavailable",
      description: marketError instanceof Error ? marketError.message : "Unknown error",
      variant: "destructive",
    })
  }, [marketError, toast])

  const autoTrade = useDeltaAutoTradeSync({
    environment,
    configured,
    serverLiveBlocked,
    tradeMode,
    singleAccountId: accountId,
    broadcastAccountIds: accountIds,
    symbol,
    marginPct: selectedPct,
    persistReady,
  })
  const [autoLotDrafts, setAutoLotDrafts] = useState<Partial<Record<DeltaAutoTradeSymbol, string>>>({})

  useEffect(() => {
    const next: Partial<Record<DeltaAutoTradeSymbol, string>> = {}
    for (const item of DELTA_AUTO_TRADE_SYMBOLS) {
      const saved = autoTrade.lotSizeBySymbol[item]
      next[item] = saved == null ? "" : String(saved)
    }
    setAutoLotDrafts(next)
  }, [autoTrade.lotSizeBySymbol])

  const autoSizingSummary = useMemo(() => {
    const parts = autoTrade.enabledSymbols.map((item) => {
      const fixed = autoTrade.lotSizeBySymbol[item]
      return fixed != null ? `${item} ${fixed} Lot` : `${item} ${selectedPct ?? 25}%`
    })
    return parts.length > 0 ? parts.join(" · ") : "No products selected"
  }, [autoTrade.enabledSymbols, autoTrade.lotSizeBySymbol, selectedPct])

  async function saveAutoLotSize(item: DeltaAutoTradeSymbol) {
    const raw = autoLotDrafts[item]?.trim() ?? ""
    const next = raw === "" ? null : Number(raw)
    if (next != null && (!Number.isSafeInteger(next) || next < 1 || next > maxOrderSize)) {
      toast({
        title: "Invalid auto-trade lot size",
        description: `Enter a whole number from 1 to ${maxOrderSize}, or leave the box blank.`,
        variant: "destructive",
      })
      setAutoLotDrafts((current) => ({
        ...current,
        [item]: autoTrade.lotSizeBySymbol[item]?.toString() ?? "",
      }))
      return
    }
    if ((autoTrade.lotSizeBySymbol[item] ?? null) === next) return
    await autoTrade.saveLotSize(item, next)
  }

  const activeLeverage = leverageOpen ? pendingLeverage : leverage

  // Wallet read failures (bad key, IP not whitelisted) must surface instead of a stuck "Loading…".
  const marginError = useMemo(() => {
    if (!marginEntries) return null
    const relevant =
      tradeMode === "single"
        ? accountId
          ? [marginEntries[accountId]]
          : []
        : accountIds.map((id) => marginEntries[id])
    const failed = relevant.find((entry) => entry?.error)
    return failed?.error ?? null
  }, [accountId, accountIds, marginEntries, tradeMode])

  const marginLoading = useMemo(() => {
    if (!marginEntries) return false
    const relevant =
      tradeMode === "single"
        ? accountId
          ? [marginEntries[accountId]]
          : []
        : accountIds.map((id) => marginEntries[id])
    return relevant.some((entry) => entry?.loading)
  }, [accountId, accountIds, marginEntries, tradeMode])

  useEffect(() => {
    if (!marginEntries || Object.keys(marginEntries).length === 0) return

    if (tradeMode === "single") {
      setBroadcastMargin(null)
      if (!accountId) {
        setAvailableMargin(null)
        return
      }
      setAvailableMargin(marginEntries[accountId]?.marginUsd ?? null)
      return
    }

    if (accountIds.length === 0) {
      setAvailableMargin(null)
      setBroadcastMargin(null)
      return
    }

    const wallets = accountIds
      .map((id) => marginEntries[id])
      .filter(Boolean) as DeltaAccountMarginEntry[]

    const funded = wallets.filter((entry) => (entry.marginUsd ?? 0) > 0)
    if (funded.length === 0) {
      setAvailableMargin(wallets[0]?.marginUsd ?? 0)
      setBroadcastMargin(
        wallets[0]
          ? {
              minMarginUsd: wallets[0].marginUsd ?? 0,
              accountCount: wallets.length,
              limitingLabel: wallets[0].label,
            }
          : null,
      )
      return
    }

    const limiting = funded.reduce(
      (min, cur) => ((cur.marginUsd ?? 0) < (min.marginUsd ?? 0) ? cur : min),
      funded[0],
    )
    setAvailableMargin(limiting.marginUsd ?? 0)
    setBroadcastMargin({
      minMarginUsd: limiting.marginUsd ?? 0,
      accountCount: wallets.length,
      limitingLabel: limiting.label,
    })
  }, [accountId, accountIds, marginEntries, tradeMode])

  useEffect(() => {
    if (autoTrade.loading) return
    const lv = autoTrade.hasSavedLeverage ? autoTrade.savedLeverage : apiLeverage
    if (lv == null) return
    setLeverage(lv)
    setPendingLeverage(nearestLeverageStep(lv))
  }, [autoTrade.loading, autoTrade.hasSavedLeverage, autoTrade.savedLeverage, apiLeverage, symbol])

  useEffect(() => {
    if (autoTrade.loading) return
    setSelectedPct(autoTrade.savedMarginPct)
  }, [autoTrade.loading, autoTrade.savedMarginPct])

  // SWR refetches on key change, so this only resets local sizing inputs. Never key this on
  // `marginEntries` — that object gets a fresh identity on every wallet revalidation, which would
  // silently drop the selected % (and with it the auto-trade margin %) mid-session.
  useEffect(() => {
    if (selectedPct != null) return
    setLots(1)
  }, [symbol, accountId, accountIdsKey, tradeMode, selectedPct])

  const contractValue = product?.contractValue ?? 0.001
  const contractUnit = product?.contractUnit ?? "BTC"
  const price = markPrice ?? 0
  const maxPositionUsd = product?.maxLeverageNotional ?? 0

  const idealLotsForPct = useCallback(
    (pct: number, leverageForCalc: number) => {
      if (!availableMargin || price <= 0) return 1
      return computeOrderTicketLots({
        availableMarginUsd: availableMargin,
        pct,
        contractValue,
        markPrice: price,
        leverage: leverageForCalc,
        maxNotionalUsd: maxPositionUsd > 0 ? maxPositionUsd : undefined,
      })
    },
    [availableMargin, contractValue, maxPositionUsd, price],
  )

  // % sizing is clamped to the per-order cap, matching the auto-trade path, so a large balance
  // can never compute a size the API would reject outright.
  const cappedLotsForPct = useCallback(
    (pct: number, leverageForCalc: number) =>
      Math.min(idealLotsForPct(pct, leverageForCalc), orderSizeCap),
    [idealLotsForPct, orderSizeCap],
  )

  // Delta-style: recompute lots when margin, price, leverage, or selected % changes
  useEffect(() => {
    if (selectedPct == null || !availableMargin || price <= 0) return
    setLots(cappedLotsForPct(selectedPct, activeLeverage))
  }, [selectedPct, availableMargin, price, activeLeverage, cappedLotsForPct])

  const underlyingSize = useMemo(() => lotsToUnderlying(lots, contractValue), [lots, contractValue])
  const fundsRequired = useMemo(
    () => (price > 0 ? marginRequiredUsd(lots, contractValue, price, activeLeverage) : 0),
    [lots, contractValue, price, activeLeverage],
  )

  const pctLotsBeforeCap =
    selectedPct != null && availableMargin && price > 0
      ? idealLotsForPct(selectedPct, activeLeverage)
      : null
  const pctCappedByOrderLimit = pctLotsBeforeCap != null && pctLotsBeforeCap > orderSizeCap

  // Only reachable by typing a size manually — % sizing is already clamped.
  const exceedsOrderCap = lots > orderSizeCap

  function clampManualLots(value: number) {
    return Math.max(1, Math.floor(value))
  }

  function applyPct(pct: number) {
    if (!availableMargin || price <= 0) {
      toast({
        title: "Waiting for market data",
        description:
          tradeMode === "broadcast"
            ? "Load margins for selected accounts before % sizing works."
            : "Margin and price must load before % sizing works.",
        variant: "destructive",
      })
      return
    }
    setSelectedPct(pct)
    setLots(cappedLotsForPct(pct, activeLeverage))
  }

  function handleLotsChange(raw: string) {
    setLots(clampManualLots(Number(raw) || 1))
    setSelectedPct(null)
  }

  async function applyLeverage() {
    if (!configured || !product) return
    const targets =
      tradeMode === "broadcast"
        ? accountIds
        : accountId
          ? [accountId]
          : []
    if (targets.length === 0) {
      toast({ title: "Select at least one account", variant: "destructive" })
      return
    }

    onBusyChange("leverage")
    try {
      const body =
        tradeMode === "broadcast"
          ? { symbol, leverage: pendingLeverage, accountIds: targets }
          : { symbol, leverage: pendingLeverage, accountId: targets[0] }

      const response = await authFetch(deltaApiPath("/api/delta/leverage", environment), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to set leverage")

      if (tradeMode === "broadcast" && Array.isArray(data.results)) {
        const okCount = data.okCount ?? data.results.filter((r: { ok: boolean }) => r.ok).length
        const total = data.total ?? data.results.length
        const failed = data.results.filter((r: { ok: boolean; label?: string; error?: string }) => !r.ok)
        toast({
          title: `Leverage ${pendingLeverage}x on ${okCount}/${total} account(s)`,
          description:
            failed.length > 0
              ? failed.map((r: { label?: string; error?: string }) => `${r.label}: ${r.error}`).join(" · ")
              : undefined,
          variant: okCount === total ? "default" : "destructive",
        })
      } else {
        toast({ title: `Leverage set to ${pendingLeverage}x` })
      }

      setLeverage(pendingLeverage)
      setLeverageOpen(false)
      await autoTrade.saveLeverage(pendingLeverage).catch(() => undefined)
      if (selectedPct != null) {
        setLots(cappedLotsForPct(selectedPct, pendingLeverage))
      }
    } catch (error) {
      toast({
        title: "Leverage update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function placeOrder(side: "buy" | "sell") {
    if (tradeMode === "broadcast" && accountIds.length === 0) {
      toast({ title: "Select at least one account", variant: "destructive" })
      return
    }
    if (tradeMode === "single" && !accountId) {
      toast({ title: "Select an account", variant: "destructive" })
      return
    }
    if (lots > orderSizeCap) {
      toast({
        title: "Order size too large",
        description: `Max ${orderSizeCap} Lot per order. Lower the size or raise ${
          isLive ? "DELTA_LIVE_ORDER_MAX_SIZE" : "DELTA_TEST_ORDER_MAX_SIZE"
        }.`,
        variant: "destructive",
      })
      return
    }
    onBusyChange("order")
    try {
      const body =
        tradeMode === "broadcast"
          ? { symbol, side, size: lots, accountIds }
          : { symbol, side, size: lots, accountId }

      const response = await authFetch(deltaApiPath("/api/delta/orders", environment), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Order failed")

      if (tradeMode === "broadcast" && Array.isArray(data.results)) {
        const okCount = data.okCount ?? data.results.filter((r: { ok: boolean }) => r.ok).length
        const total = data.total ?? data.results.length
        const skippedCount = data.skippedCount ?? 0
        const failed = data.results.filter((r: { ok: boolean; label?: string; error?: string }) => !r.ok)
        toast({
          title: `${okCount}/${total} orders placed`,
          description:
            failed.length > 0
              ? failed.map((r: { label?: string; error?: string }) => `${r.label}: ${r.error}`).join(" · ")
              : `${lots} Lot ${side} on ${total} account(s)`,
          variant: okCount === total ? "default" : "destructive",
        })
        if (skippedCount > 0) {
          toast({
            title: `${skippedCount} account(s) skipped`,
            description: failed
              .filter((r: { error?: string }) => r.error?.toLowerCase().includes("margin"))
              .map((r: { label?: string }) => r.label)
              .join(", "),
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: side === "buy" ? "Long opened" : "Short opened",
          description: `${data.accountLabel ?? ""} · ${lots} Lot · ${data.symbol}${data.brokerOrderId ? ` · #${data.brokerOrderId}` : ""}`,
        })
      }
      setConfirmSide(null)
      onRefreshMargins?.()
      onOrderPlaced()
    } catch (error) {
      toast({
        title: "Order failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  const leverageTargets =
    tradeMode === "broadcast" ? accountIds.length : accountId ? 1 : 0

  const leverageIndex = DELTA_LEVERAGE_STEPS.indexOf(pendingLeverage as (typeof DELTA_LEVERAGE_STEPS)[number])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="space-y-4">
        {/* Leverage */}
        <Collapsible open={leverageOpen} onOpenChange={setLeverageOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-violet-500/30 bg-[#0c0d12] px-4 py-3 text-left transition-colors hover:border-violet-400/50"
            >
              <span className="text-sm text-muted-foreground">Leverage</span>
              <span className="flex items-center gap-2 text-sm font-semibold text-violet-300">
                {leverage}x
                {leverageOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </span>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-4 rounded-lg border border-violet-500/20 bg-[#0c0d12] p-4">
            <div className="flex items-center justify-between gap-3">
              <Input
                type="number"
                min={1}
                value={pendingLeverage}
                onChange={(e) => setPendingLeverage(nearestLeverageStep(Number(e.target.value) || 1))}
                className="max-w-[120px] border-violet-500/40 text-center text-violet-200"
              />
              <span className="text-sm text-muted-foreground">Max position at {pendingLeverage}x</span>
              <span className="text-sm font-medium text-foreground">
                {maxPositionUsd > 0 ? `${formatUsd(maxPositionUsd)} USD` : "—"}
              </span>
            </div>
            <div className="relative px-1 pt-2">
              <input
                type="range"
                min={0}
                max={DELTA_LEVERAGE_STEPS.length - 1}
                step={1}
                value={leverageIndex >= 0 ? leverageIndex : 3}
                onChange={(e) => {
                  const idx = Number(e.target.value)
                  setPendingLeverage(DELTA_LEVERAGE_STEPS[idx] ?? 10)
                }}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-violet-950 accent-violet-500"
              />
              <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                {DELTA_LEVERAGE_STEPS.map((step) => (
                  <span
                    key={step}
                    className={cn(pendingLeverage === step && "font-semibold text-violet-300")}
                  >
                    {step}x
                  </span>
                ))}
              </div>
            </div>
            <Button
              className="w-full bg-violet-600 hover:bg-violet-600/90"
              onClick={() => void applyLeverage()}
              disabled={
                !configured ||
                leverageTargets === 0 ||
                busy === "leverage" ||
                pendingLeverage === leverage ||
                !tradingAllowed
              }
            >
              {busy === "leverage" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Set to {pendingLeverage}x
              {tradeMode === "broadcast" && leverageTargets > 1 ? ` · ${leverageTargets} accounts` : ""}
            </Button>
            {tradeMode === "broadcast" && leverageTargets > 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Applies {pendingLeverage}x on all selected accounts for {symbol}.
              </p>
            ) : tradeMode === "single" ? (
              <p className="text-[11px] text-muted-foreground">
                Leverage is per account — switch account above to view or set another.
              </p>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {/* Order type tabs */}
        <div className="flex border-b border-border/60">
          {(["limit", "market"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              disabled={tab === "limit"}
              onClick={() => tab === "market" && setOrderType(tab)}
              className={cn(
                "flex-1 px-3 py-2.5 text-sm capitalize transition-colors",
                orderType === tab
                  ? "border-b-2 border-violet-400 font-medium text-foreground"
                  : "text-muted-foreground",
                tab === "limit" && "cursor-not-allowed opacity-40",
              )}
            >
              {tab === "limit" ? "Limit" : "Market"}
            </button>
          ))}
          <span className="flex items-center px-3 py-2.5 text-xs text-muted-foreground/50">Maker Only</span>
        </div>

        {/* Lot size input */}
        <div className="space-y-2">
          <div className="flex overflow-hidden rounded-lg border border-border/70 bg-[#0c0d12]">
            <Input
              type="number"
              min={1}
              step={1}
              value={lots}
              onChange={(e) => handleLotsChange(e.target.value)}
              className="border-0 bg-transparent text-right text-lg font-medium focus-visible:ring-0"
            />
            <div className="flex items-center border-l border-border/60 px-4 text-sm text-muted-foreground">
              Lot
              <ChevronDown className="ml-1 h-3.5 w-3.5 opacity-50" />
            </div>
          </div>

          <div className="grid grid-cols-5 gap-1">
            {SIZE_PCTS.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applyPct(pct)}
                className={cn(
                  "rounded-md py-2 text-xs font-medium transition-colors",
                  selectedPct === pct
                    ? "bg-violet-600/20 text-violet-300 ring-1 ring-violet-500/40"
                    : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatUnderlying(underlyingSize, contractUnit)}</span>
            <span>
              1 Lot = {contractValue} {contractUnit}
            </span>
          </div>
        </div>

        {/* Margin info */}
        <div className="space-y-2 rounded-lg border border-border/50 bg-[#0c0d12]/80 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              Funds req.
              <button
                type="button"
                onClick={() => void Promise.all([loadMarketData(), onRefreshMargins?.() ?? Promise.resolve()])}
                className="text-violet-400 hover:text-violet-300"
                title="Refresh"
              >
                <RefreshCw className={cn("h-3.5 w-3.5", loadingMarket && "animate-spin")} />
              </button>
            </span>
            <span>{price > 0 ? `${formatUsd(fundsRequired)} USD` : "—"}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <span className="text-muted-foreground">Available Margin</span>
            <span className={cn("text-right", marginError && "text-amber-300")}>
              {availableMargin != null
                ? tradeMode === "broadcast" && broadcastMargin
                  ? `${formatUsd(availableMargin)} USD (min · ${broadcastMargin.accountCount})`
                  : `${formatUsd(availableMargin)} USD`
                : marginError
                  ? marginError
                  : tradeMode === "broadcast"
                    ? accountIds.length === 0
                      ? "Select accounts"
                      : marginLoading
                        ? "Loading…"
                        : "—"
                    : !configured
                      ? "Add accounts"
                      : marginLoading
                        ? "Loading…"
                        : "—"}
            </span>
          </div>
          {tradeMode === "broadcast" && broadcastMargin ? (
            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                % sizing uses smallest margin — {broadcastMargin.limitingLabel} ({formatUsd(broadcastMargin.minMarginUsd)} USD)
              </p>
              <p className="text-[11px] text-muted-foreground">
                {marginReadyCount}/{broadcastMargin.accountCount} accounts ready
                {marginReadyCount < broadcastMargin.accountCount ? " · some accounts low margin" : ""}
              </p>
              {accountIds.length > 0 ? (
                <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                  {accountIds.map((id) => {
                    const entry = marginEntries?.[id]
                    if (!entry) return null
                    if (entry.error) {
                      return (
                        <li key={id} className="text-amber-300">
                          {entry.label}: {entry.error}
                        </li>
                      )
                    }
                    return (
                      <li key={id} className={cn(isLowMargin(entry.marginUsd) && "text-amber-300")}>
                        {entry.label}: ${formatMarginUsd(entry.marginUsd)}
                        {isLowMargin(entry.marginUsd) ? " · low margin" : ""}
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
          {selectedPct != null && availableMargin != null && price > 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {selectedPct}% of {tradeMode === "broadcast" ? "min margin" : "margin"} ≈{" "}
              {formatUsd((availableMargin * selectedPct) / 100)} budget · {activeLeverage}x leverage
              {tradeMode === "broadcast" && broadcastMargin
                ? ` · same ${lots} Lot on ${broadcastMargin.accountCount} account(s)`
                : ""}
            </p>
          ) : null}
          {pctCappedByOrderLimit ? (
            <p className="text-[11px] text-muted-foreground">
              {selectedPct}% works out to {pctLotsBeforeCap} Lot · capped at {orderSizeCap} Lot by the
              per-order limit.
            </p>
          ) : null}
        </div>
        </div>

        {/* Auto trade — same accounts as the ticket, with per-symbol lot overrides */}
        <div
          className={cn(
            "space-y-3 rounded-lg border px-4 py-3",
            autoTrade.enabled
              ? isLive
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-amber-400/30 bg-amber-500/5"
              : "border-border/50 bg-[#0c0d12]/80",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Auto trade</p>
                <p className="text-[11px] text-muted-foreground">TradingView sync</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {autoTrade.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
              <Label htmlFor="auto-trade-enabled" className="text-xs text-muted-foreground">
                {autoTrade.enabled ? "On" : "Off"}
              </Label>
              <Switch
                id="auto-trade-enabled"
                checked={autoTrade.enabled}
                disabled={autoTrade.loading || autoTrade.saving || !autoTrade.canEnable}
                onCheckedChange={(checked) => {
                  void autoTrade.toggleEnabled(checked).catch((error) => {
                    toast({
                      title: "Could not update auto-trade",
                      description: error instanceof Error ? error.message : "Unknown error",
                      variant: "destructive",
                    })
                  })
                }}
                className={cn(autoTrade.enabled && "data-[state=checked]:bg-emerald-600")}
              />
            </div>
          </div>

          {autoTrade.enabled ? (
            <p className="text-[11px] text-muted-foreground">
              {autoSizingSummary} ·{" "}
              {tradeMode === "broadcast"
                ? `${marginReadyCount}/${accountIds.length} account(s) ready`
                : targetLabels[0] ?? "selected account"}
            </p>
          ) : null}

          <p className="text-[11px] text-muted-foreground">
            Tick the products to auto-trade. A blank Lot box sizes from {selectedPct ?? 25}% margin.
          </p>

          <div className="space-y-1.5">
            {DELTA_AUTO_TRADE_SYMBOLS.map((item) => {
              const checked = autoTrade.enabledSymbols.includes(item)
              const lastEnabled = checked && autoTrade.enabledSymbols.length === 1
              return (
                <div
                  key={item}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2.5 py-1.5",
                    checked ? "border-border/60 bg-background/40" : "border-border/40 opacity-60",
                  )}
                >
                  <Checkbox
                    className="shrink-0"
                    checked={checked}
                    disabled={autoTrade.loading || autoTrade.saving || lastEnabled}
                    onCheckedChange={(value) => {
                      const next = new Set(autoTrade.enabledSymbols)
                      if (value === true) next.add(item)
                      else next.delete(item)
                      void autoTrade.setSymbols([...next] as DeltaAutoTradeSymbol[]).catch((error) => {
                        toast({
                          title: "Could not update symbols",
                          description: error instanceof Error ? error.message : "Unknown error",
                          variant: "destructive",
                        })
                      })
                    }}
                  />
                  <span className="flex-1 truncate text-xs font-medium">{item}</span>
                  <Input
                    type="number"
                    min={1}
                    max={maxOrderSize}
                    step={1}
                    inputMode="numeric"
                    value={autoLotDrafts[item] ?? ""}
                    placeholder="Auto"
                    aria-label={`${item} auto-trade lot size`}
                    disabled={autoTrade.loading || autoTrade.saving}
                    onChange={(event) =>
                      setAutoLotDrafts((current) => ({ ...current, [item]: event.target.value }))
                    }
                    onBlur={() => {
                      void saveAutoLotSize(item).catch((error) => {
                        toast({
                          title: "Could not save lot size",
                          description: error instanceof Error ? error.message : "Unknown error",
                          variant: "destructive",
                        })
                      })
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur()
                    }}
                    className="h-7 w-16 shrink-0 px-2 text-right text-xs"
                  />
                  <span className="w-6 shrink-0 text-[10px] text-muted-foreground">Lot</span>
                </div>
              )
            })}
          </div>

          {isLive && autoTrade.serverLiveBlocked ? (
            <p className="text-[11px] text-rose-300">Live auto-trade blocked on this server.</p>
          ) : null}
        </div>
      </div>

      {/* Long / Short */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          className={cn(
            "h-12 text-base font-semibold hover:bg-emerald-600/90",
            isLive ? "bg-emerald-700" : "bg-emerald-600",
          )}
          disabled={
            !tradingAllowed ||
            busy === "order" ||
            orderType !== "market" ||
            (tradeMode === "single" && !accountId) ||
            (tradeMode === "broadcast" && accountIds.length === 0)
          }
          onClick={() => {
            setLiveConfirmText("")
            setConfirmSide("buy")
          }}
        >
          Long
        </Button>
        <Button
          className={cn(
            "h-12 text-base font-semibold",
            isLive ? "bg-rose-700 hover:bg-rose-700/90" : "bg-rose-600 hover:bg-rose-600/90",
          )}
          disabled={
            !tradingAllowed ||
            busy === "order" ||
            orderType !== "market" ||
            (tradeMode === "single" && !accountId) ||
            (tradeMode === "broadcast" && accountIds.length === 0)
          }
          onClick={() => {
            setLiveConfirmText("")
            setConfirmSide("sell")
          }}
        >
          Short
        </Button>
      </div>

      {!tradingAllowed && configured ? (
        <p className="text-center text-xs text-amber-300">
          {serverLiveBlocked ? "Live trading is blocked on this server." : "Enable at least one account to trade."}
        </p>
      ) : !configured ? (
        <p className="text-center text-xs text-amber-300">Save API credentials to trade.</p>
      ) : exceedsOrderCap ? (
        <p className="text-center text-xs text-amber-300">
          {lots} Lot exceeds the {orderSizeCap} Lot per-order limit — lower the size or raise the limit.
        </p>
      ) : null}

      <AlertDialog
        open={confirmSide != null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmSide(null)
            setLiveConfirmText("")
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Confirm {confirmSide === "buy" ? "Long" : "Short"} · {lots} Lot
              {isLive ? " · LIVE" : ""}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Market {confirmSide === "buy" ? "buy" : "sell"} · {lots} Lot on {symbol}.
              {tradeMode === "broadcast"
                ? ` Targets: ${targetLabels.join(", ")}.`
                : targetLabels[0]
                  ? ` Account: ${targetLabels[0]}.`
                  : ""}
              {price > 0 && tradeMode === "single" ? ` ~${formatUsd(fundsRequired)} USD margin at ${activeLeverage}x.` : ""}
              {isLive ? " This order uses real money on Delta India production." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {isLive ? (
            <div className="space-y-2 px-1">
              <Label htmlFor="live-confirm" className="text-xs text-rose-300">
                Type LIVE to confirm
              </Label>
              <Input
                id="live-confirm"
                value={liveConfirmText}
                onChange={(e) => setLiveConfirmText(e.target.value)}
                placeholder="LIVE"
                className="border-rose-500/40"
                autoComplete="off"
              />
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isLive && liveConfirmText.trim().toUpperCase() !== "LIVE"}
              onClick={() => confirmSide && void placeOrder(confirmSide)}
              className={isLive ? "bg-rose-600 hover:bg-rose-600/90" : undefined}
            >
              {confirmSide === "buy" ? "Long" : "Short"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
