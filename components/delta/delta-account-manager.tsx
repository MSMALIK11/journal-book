"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Loader2, Pencil, Plug, Star, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import type { DeltaAccount, DeltaEnvironment } from "@/components/delta/delta-shared"
import {
  formatMarginUsd,
  isLowMargin,
  type DeltaAccountMarginEntry,
} from "@/components/delta/use-delta-account-margins"
import { deltaApiPath } from "@/components/delta/delta-shared"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

export type { DeltaAccount }

type DeltaAccountManagerProps = {
  environment: DeltaEnvironment
  accounts: DeltaAccount[]
  envOverride?: boolean
  maxAccounts?: number
  busy: string | null
  onBusyChange: (busy: string | null) => void
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  onAccountsChange: (accounts?: DeltaAccount[]) => void
  addModalOpen: boolean
  onAddModalOpenChange: (open: boolean) => void
}

export function DeltaAccountManager({
  environment,
  accounts,
  envOverride,
  maxAccounts = 10,
  busy,
  onBusyChange,
  marginEntries,
  onAccountsChange,
  addModalOpen,
  onAddModalOpenChange,
}: DeltaAccountManagerProps) {
  const { toast } = useToast()
  const [accountLabel, setAccountLabel] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState("")

  async function addAccount() {
    if (!accountLabel.trim() || !apiKey.trim() || !apiSecret.trim()) {
      toast({ title: "Fill label, API key, and secret", variant: "destructive" })
      return
    }
    onBusyChange("add-account")
    try {
      const response = await authFetch(deltaApiPath("/api/delta/accounts", environment), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: accountLabel.trim(),
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          isDefault: accounts.length === 0,
          environment,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to add account")
      const savedLabel = data.account?.label ?? accountLabel.trim()
      setAccountLabel("")
      setApiKey("")
      setApiSecret("")
      onAddModalOpenChange(false)
      toast({ title: "Account added", description: `Label: ${savedLabel}` })
      onAccountsChange(Array.isArray(data.accounts) ? data.accounts : undefined)
    } catch (error) {
      toast({
        title: "Add failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function testAccount(accountId: string) {
    onBusyChange(`test-${accountId}`)
    try {
      const response = await authFetch(deltaApiPath(`/api/delta/accounts/${accountId}/connection`, environment), {
        method: "POST",
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || data.message || "Connection failed")
      toast({ title: "Connection OK", description: data.message })
    } catch (error) {
      toast({
        title: "Connection failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function setDefault(accountId: string) {
    onBusyChange(`default-${accountId}`)
    try {
      const response = await authFetch(deltaApiPath(`/api/delta/accounts/${accountId}`, environment), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to set default")
      onAccountsChange()
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function toggleEnabled(account: DeltaAccount, enabled: boolean) {
    onBusyChange(`enabled-${account.id}`)
    try {
      const response = await authFetch(deltaApiPath(`/api/delta/accounts/${account.id}`, environment), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to update account")
      toast({
        title: enabled ? "Account enabled" : "Account disabled",
        description: `${account.label} ${enabled ? "is active for trading" : "is hidden from trading"}`,
      })
      onAccountsChange()
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  async function renameAccount(accountId: string) {
    const nextLabel = editLabel.trim()
    if (!nextLabel) {
      toast({ title: "Enter an account name", variant: "destructive" })
      return
    }
    onBusyChange(`rename-${accountId}`)
    try {
      const response = await authFetch(deltaApiPath(`/api/delta/accounts/${accountId}`, environment), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: nextLabel }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to rename account")
      toast({ title: "Account renamed", description: nextLabel })
      setEditingId(null)
      setEditLabel("")
      onAccountsChange()
    } catch (error) {
      toast({
        title: "Rename failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  function startEditing(account: DeltaAccount) {
    setEditingId(account.id)
    setEditLabel(account.label.trim())
  }

  function cancelEditing() {
    setEditingId(null)
    setEditLabel("")
  }

  async function deleteAccount(accountId: string) {
    onBusyChange(`delete-${accountId}`)
    try {
      const response = await authFetch(deltaApiPath(`/api/delta/accounts/${accountId}`, environment), { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to delete account")
      toast({ title: "Account removed" })
      onAccountsChange()
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      onBusyChange(null)
    }
  }

  return (
    <div className="space-y-5">
      {envOverride ? (
        <p className="rounded-lg border border-amber-400/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
          Server env keys (DELTA_API_KEY) override saved accounts. Remove env vars to use multiple DB accounts.
        </p>
      ) : null}

      {accounts.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className={cn(
                "group rounded-xl border bg-[#0c0d12] p-4 transition-colors hover:border-violet-400/30",
                account.enabled ? "border-border/60" : "border-border/40 opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  {editingId === account.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-8 text-sm"
                        placeholder="e.g. Main, Scalping, Acc 2"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void renameAccount(account.id)
                          if (e.key === "Escape") cancelEditing()
                        }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 shrink-0"
                        onClick={() => void renameAccount(account.id)}
                        disabled={busy != null}
                      >
                        <Check className="h-4 w-4 text-emerald-400" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={cancelEditing}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          account.enabled ? "bg-emerald-400" : "bg-muted-foreground/50",
                        )}
                      />
                      <span className="truncate text-lg font-semibold text-cyan-50">{account.label}</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() => startEditing(account)}
                        disabled={busy != null}
                        aria-label={`Rename ${account.label}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                  <p className="font-mono text-xs text-cyan-300/80">
                    API key{account.lastFour ? ` ····${account.lastFour}` : " ····----"}
                  </p>
                  {account.enabled ? (() => {
                    const margin = marginEntries?.[account.id]
                    if (margin?.error) {
                      return <p className="text-xs text-amber-300">Wallet: {margin.error}</p>
                    }
                    if (!margin || margin.loading || margin.marginUsd == null) {
                      return (
                        <p className="text-xs tabular-nums text-muted-foreground">
                          Balance: {margin?.loading ? "Loading…" : "—"}
                        </p>
                      )
                    }
                    return (
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          isLowMargin(margin.marginUsd) ? "text-rose-300" : "text-emerald-300/90",
                        )}
                      >
                        Balance: ${formatMarginUsd(margin.balanceUsd ?? margin.marginUsd)}
                        <span className="text-muted-foreground">
                          {" · "}Available: ${formatMarginUsd(margin.marginUsd)}
                        </span>
                        {isLowMargin(margin.marginUsd) ? (
                          <span className="ml-1.5 text-rose-400">· Low margin</span>
                        ) : null}
                      </p>
                    )
                  })() : null}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        account.environment === "live"
                          ? "border-rose-400/40 text-rose-300"
                          : "border-amber-400/40 text-amber-300",
                      )}
                    >
                      {account.environment === "live" ? "Live" : "Demo"}
                    </Badge>
                    {account.isDefault ? (
                      <Badge variant="outline" className="border-violet-400/40 text-violet-300">
                        Default
                      </Badge>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span
                    className={cn(
                      "text-[10px] font-medium uppercase tracking-wide",
                      account.enabled ? "text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {account.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={account.enabled}
                    onCheckedChange={(checked) => void toggleEnabled(account, checked)}
                    disabled={busy != null || busy === `enabled-${account.id}`}
                    aria-label={`${account.enabled ? "Disable" : "Enable"} ${account.label}`}
                    className="data-[state=checked]:bg-emerald-600"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1 border-t border-border/40 pt-3">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => void testAccount(account.id)}
                  disabled={busy != null}
                >
                  <Plug className="mr-1 h-3.5 w-3.5" />
                  Test
                </Button>
                {!account.isDefault ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => void setDefault(account.id)}
                    disabled={busy != null}
                  >
                    <Star className="mr-1 h-3.5 w-3.5" />
                    Set default
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-rose-400 hover:text-rose-300"
                  onClick={() => void deleteAccount(account.id)}
                  disabled={busy != null}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/60 bg-[#0c0d12]/50 px-6 py-10 text-center">
          <p className="text-sm font-medium text-muted-foreground">No connected accounts</p>
          <p className="mt-1 text-xs text-muted-foreground/80">
            Add your first {environment === "live" ? "live" : "demo"} API key to get started.
          </p>
          {!envOverride && accounts.length < maxAccounts ? (
            <Button variant="outline" size="sm" className="mt-4" onClick={() => onAddModalOpenChange(true)}>
              Add account
            </Button>
          ) : null}
        </div>
      )}

      {!envOverride && accounts.length < maxAccounts ? (
        <Dialog open={addModalOpen} onOpenChange={onAddModalOpenChange}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add account</DialogTitle>
              <DialogDescription>
                API keys from{" "}
                <Link
                  href={
                    environment === "live"
                      ? "https://www.delta.exchange/app/account/manageapikeys"
                      : "https://demo.delta.exchange/app/account/manageapikeys"
                  }
                  className="text-foreground underline underline-offset-2"
                  target="_blank"
                >
                  {environment === "live" ? "delta.exchange" : "demo.delta.exchange"}
                </Link>
                . Trade permission required.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="delta-acc-label">Label</Label>
                <Input
                  id="delta-acc-label"
                  value={accountLabel}
                  onChange={(e) => setAccountLabel(e.target.value)}
                  placeholder="Main, Scalping, Account 2"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delta-acc-key">API Key</Label>
                <Input
                  id="delta-acc-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="delta-acc-secret">API Secret</Label>
                <Input
                  id="delta-acc-secret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void addAccount()} disabled={busy === "add-account"}>
                {busy === "add-account" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save account
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}
