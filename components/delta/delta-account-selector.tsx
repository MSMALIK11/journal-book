"use client"

import { useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { DeltaAccount, DeltaEnvironment } from "@/components/delta/delta-shared"
import {
  formatMarginUsd,
  isLowMargin,
  type DeltaAccountMarginEntry,
} from "@/components/delta/use-delta-account-margins"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type DeltaTradeMode = "single" | "broadcast"

function storageKeys(environment: DeltaEnvironment) {
  return {
    mode: `delta-${environment}-trade-mode`,
    selected: `delta-${environment}-selected-accounts`,
    single: `delta-${environment}-single-account`,
  }
}

type DeltaAccountSelectorProps = {
  environment: DeltaEnvironment
  accounts: DeltaAccount[]
  allAccountsCount?: number
  mode: DeltaTradeMode
  singleAccountId: string | null
  broadcastAccountIds: string[]
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  onModeChange: (mode: DeltaTradeMode) => void
  onSingleAccountChange: (accountId: string | null) => void
  onBroadcastAccountIdsChange: (ids: string[]) => void
}

export function loadDeltaTradeMode(environment: DeltaEnvironment): DeltaTradeMode {
  if (typeof window === "undefined") return "single"
  return localStorage.getItem(storageKeys(environment).mode) === "broadcast" ? "broadcast" : "single"
}

export function loadDeltaSingleAccountId(accounts: DeltaAccount[], environment: DeltaEnvironment): string | null {
  if (typeof window === "undefined") return accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null
  const saved = localStorage.getItem(storageKeys(environment).single)
  if (saved && accounts.some((a) => a.id === saved)) return saved
  return accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? null
}

export function loadDeltaBroadcastAccountIds(accounts: DeltaAccount[], environment: DeltaEnvironment): string[] {
  if (typeof window === "undefined") return accounts.map((a) => a.id)
  try {
    const raw = localStorage.getItem(storageKeys(environment).selected)
    if (!raw) return accounts.map((a) => a.id)
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((id) => accounts.some((a) => a.id === id))
    return valid.length > 0 ? valid : accounts.map((a) => a.id)
  } catch {
    return accounts.map((a) => a.id)
  }
}

export function DeltaAccountSelector({
  environment,
  accounts,
  allAccountsCount = 0,
  mode,
  singleAccountId,
  broadcastAccountIds,
  marginEntries,
  onModeChange,
  onSingleAccountChange,
  onBroadcastAccountIdsChange,
}: DeltaAccountSelectorProps) {
  const { toast } = useToast()
  const [initialized, setInitialized] = useState(false)
  const warnedRef = useRef(false)
  const keys = storageKeys(environment)

  useEffect(() => {
    if (initialized || accounts.length === 0) return
    onModeChange(loadDeltaTradeMode(environment))
    onSingleAccountChange(loadDeltaSingleAccountId(accounts, environment))
    onBroadcastAccountIdsChange(loadDeltaBroadcastAccountIds(accounts, environment))
    setInitialized(true)
  }, [accounts, environment, initialized, onBroadcastAccountIdsChange, onModeChange, onSingleAccountChange])

  useEffect(() => {
    if (!initialized) return
    localStorage.setItem(keys.mode, mode)
  }, [initialized, keys.mode, mode])

  useEffect(() => {
    if (!initialized || !singleAccountId) return
    localStorage.setItem(keys.single, singleAccountId)
  }, [initialized, keys.single, singleAccountId])

  useEffect(() => {
    if (!initialized) return
    localStorage.setItem(keys.selected, JSON.stringify(broadcastAccountIds))
  }, [broadcastAccountIds, initialized, keys.selected])

  useEffect(() => {
    if (initialized && accounts.length === 0 && allAccountsCount > 0 && !warnedRef.current) {
      warnedRef.current = true
      toast({
        title: "No active accounts",
        description: "Enable at least one account in API Integration",
      })
    }
    if (accounts.length > 0) warnedRef.current = false
  }, [accounts.length, allAccountsCount, initialized, toast])

  function toggleBroadcast(id: string) {
    if (broadcastAccountIds.includes(id)) {
      onBroadcastAccountIdsChange(broadcastAccountIds.filter((x) => x !== id))
    } else {
      onBroadcastAccountIdsChange([...broadcastAccountIds, id])
    }
  }

  if (accounts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
        {allAccountsCount > 0
          ? "All accounts are disabled. Enable at least one in API Integration."
          : `Add at least one ${environment === "live" ? "live" : "demo"} account in API Integration to trade.`}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["single", "broadcast"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={mode === value ? "default" : "outline"}
            onClick={() => onModeChange(value)}
            className={cn(mode === value && value === "broadcast" && "bg-violet-600 hover:bg-violet-600/90")}
          >
            {value === "single" ? "Single" : "Broadcast"}
          </Button>
        ))}
      </div>

      {mode === "single" ? (
        <select
          value={singleAccountId ?? ""}
          onChange={(e) => onSingleAccountChange(e.target.value || null)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
              {marginEntries?.[account.id]?.marginUsd != null
                ? ` · $${formatMarginUsd(marginEntries[account.id].marginUsd)}`
                : ""}
              {account.lastFour ? ` ····${account.lastFour}` : ""}
              {account.isDefault ? " (default)" : ""}
              {isLowMargin(marginEntries?.[account.id]?.marginUsd) ? " ⚠" : ""}
            </option>
          ))}
        </select>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((account) => {
            const selected = broadcastAccountIds.includes(account.id)
            const margin = marginEntries?.[account.id]
            const low = isLowMargin(margin?.marginUsd)
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => toggleBroadcast(account.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  selected
                    ? low
                      ? "border-amber-400/50 bg-amber-500/15 text-amber-200"
                      : "border-violet-400/50 bg-violet-600/20 text-violet-200"
                    : "border-border/60 text-muted-foreground hover:border-violet-400/30",
                )}
              >
                {account.label}
                {margin?.marginUsd != null ? ` · $${formatMarginUsd(margin.marginUsd)}` : ""}
                {low ? " ⚠" : ""}
                {selected ? " ✓" : ""}
              </button>
            )
          })}
        </div>
      )}

      {mode === "broadcast" ? (
        <p className="text-[11px] text-muted-foreground">
          Long/Short will place the same market order on{" "}
          <Badge variant="outline" className="mx-0.5 border-violet-400/40 text-violet-300">
            {broadcastAccountIds.length}
          </Badge>{" "}
          selected account(s). Each account uses its own margin.
        </p>
      ) : null}
    </div>
  )
}
