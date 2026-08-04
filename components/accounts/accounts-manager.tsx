"use client"

import { useState } from "react"
import { Plus, Star, Trash2 } from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useActiveAccount, type TradingAccountSummary } from "@/hooks/use-active-account"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"

function parseSymbols(value: string) {
  return value
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function AccountRow({ account, onChanged }: { account: TradingAccountSummary; onChanged: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(account.name)
  const [symbolsText, setSymbolsText] = useState(account.symbols.join(", "))
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save() {
    setSaving(true)
    try {
      const response = await authFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, symbols: parseSymbols(symbolsText) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to save")
      const reassigned = data.tradesReassigned ?? 0
      toast({
        title: "Account updated",
        description:
          reassigned > 0
            ? `${reassigned} matching trade(s) moved to this account.`
            : undefined,
      })
      onChanged()
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  async function setDefault() {
    try {
      const response = await authFetch(`/api/accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to set default")
      toast({ title: `${account.name} is now the default account` })
      onChanged()
    } catch (error) {
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    }
  }

  async function remove() {
    setDeleting(true)
    try {
      const response = await authFetch(`/api/accounts/${account.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to delete")
      toast({ title: "Account deleted" })
      onChanged()
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            {account.name}
            {account.isDefault ? (
              <Badge variant="secondary" className="text-xs">
                Default
              </Badge>
            ) : null}
          </CardTitle>
          <div className="flex gap-2">
            {!account.isDefault ? (
              <Button variant="outline" size="sm" onClick={() => void setDefault()}>
                <Star className="h-4 w-4 mr-1" />
                Set default
              </Button>
            ) : null}
            {!account.isDefault ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={deleting}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {account.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes all trades in this account. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void remove()}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>
        <CardDescription>
          Synced trades matching these symbols go here. Unmatched symbols use your default account.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`name-${account.id}`}>Account name</Label>
          <Input id={`name-${account.id}`} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`symbols-${account.id}`}>Symbols (comma-separated)</Label>
          <Input
            id={`symbols-${account.id}`}
            value={symbolsText}
            onChange={(e) => setSymbolsText(e.target.value)}
            placeholder="BTCUSDT, BTCUSD, XAUUSD"
          />
        </div>
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </CardContent>
    </Card>
  )
}

export function AccountsManager() {
  const { accounts, refresh, isLoading } = useActiveAccount()
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [symbolsText, setSymbolsText] = useState("")
  const [creating, setCreating] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  async function reassignAllTrades() {
    setReconciling(true)
    try {
      const response = await authFetch("/api/accounts/reconcile", { method: "POST" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to reassign trades")
      toast({
        title: "Trades reassigned",
        description:
          data.moved > 0 || data.deduped > 0
            ? `${data.moved ?? 0} moved, ${data.deduped ?? 0} duplicate(s) removed.`
            : "No trades needed to move. Check each account has the right symbols.",
      })
      await refresh()
    } catch (error) {
      toast({
        title: "Reassign failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setReconciling(false)
    }
  }

  async function createAccount() {
    if (!name.trim()) {
      toast({ title: "Name is required", variant: "destructive" })
      return
    }
    setCreating(true)
    try {
      const response = await authFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), symbols: parseSymbols(symbolsText) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to create account")
      setName("")
      setSymbolsText("")
      const reassigned = data.tradesReassigned ?? 0
      toast({
        title: "Account created",
        description:
          reassigned > 0
            ? `${data.account?.name} created. ${reassigned} matching trade(s) assigned.`
            : data.account?.name,
      })
      await refresh()
    } catch (error) {
      toast({
        title: "Create failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground">Loading accounts...</p>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
          <CardDescription>
            Create separate portfolios for BTC, Gold, or any symbol. Extension sync auto-routes by symbol.
            Existing trades can be reassigned after you set symbols.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" onClick={() => void reassignAllTrades()} disabled={reconciling}>
            {reconciling ? "Reassigning..." : "Reassign trades by symbol"}
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-account-name">Name</Label>
              <Input
                id="new-account-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="BTC Backtest"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-account-symbols">Symbols</Label>
              <Input
                id="new-account-symbols"
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
                placeholder="BTCUSDT, BTCUSD"
              />
            </div>
          </div>
          <Button onClick={() => void createAccount()} disabled={creating}>
            <Plus className="h-4 w-4 mr-2" />
            {creating ? "Creating..." : "Create account"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} onChanged={() => void refresh()} />
        ))}
      </div>
    </div>
  )
}
