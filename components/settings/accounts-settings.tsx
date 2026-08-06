"use client"

import Link from "next/link"
import { Trash2, Wallet } from "lucide-react"
import { useState } from "react"
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
import { SettingsSection, SettingsHint } from "@/components/settings/settings-section"
import { useActiveAccount, revalidateAccountScopedData, type TradingAccountSummary } from "@/hooks/use-active-account"
import { authFetch } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"

function AccountListItem({
  account,
  isActive,
  onDeleted,
}: {
  account: TradingAccountSummary
  isActive: boolean
  onDeleted: () => void
}) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState(false)
  const tradeCount = account.tradeCount ?? 0
  const canDelete = !account.isDefault

  async function remove() {
    setDeleting(true)
    try {
      const response = await authFetch(`/api/accounts/${account.id}`, { method: "DELETE" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Unable to delete")

      const deletedTrades = data.tradesDeleted ?? tradeCount
      toast({
        title: "Account deleted",
        description:
          deletedTrades > 0
            ? `${account.name} and ${deletedTrades} trade record(s) removed.`
            : `${account.name} removed.`,
      })
      onDeleted()
      await revalidateAccountScopedData()
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
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/50 bg-muted/15 px-4 py-3.5 transition-colors hover:bg-muted/30">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{account.name}</p>
          {account.isDefault ? (
            <Badge variant="secondary" className="text-[10px] h-5">
              Default
            </Badge>
          ) : null}
          {isActive ? (
            <Badge className="text-[10px] h-5 bg-primary/15 text-primary hover:bg-primary/15">
              Active
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {account.symbols.length ? account.symbols.join(", ") : "No symbols"}
        </p>
        <p className="text-xs tabular-nums text-muted-foreground">
          {tradeCount} trade{tradeCount === 1 ? "" : "s"}
        </p>
      </div>

      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              disabled={deleting}
              aria-label={`Delete ${account.name}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {account.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes the account
                {tradeCount > 0 ? ` and all ${tradeCount} trade record(s) in it` : ""}. This cannot be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void remove()}>Delete account</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

export function AccountsSettings() {
  const { accounts, activeAccountId, refresh, isLoading } = useActiveAccount()

  return (
    <SettingsSection
      id="accounts"
      icon={Wallet}
      iconTone="emerald"
      title="Trading accounts"
      description="Portfolios under your login. Deleting removes all trade records in that account."
      defaultOpen
      badge={
        !isLoading && accounts.length > 0 ? (
          <Badge variant="outline" className="text-[10px] font-normal">
            {accounts.length} account{accounts.length === 1 ? "" : "s"}
          </Badge>
        ) : null
      }
    >
      <div className="space-y-3">
        <SettingsHint>
          <Link href="/accounts" className="font-medium text-foreground underline-offset-4 hover:underline">
            Manage symbols & create accounts
          </Link>
          {" — "}
          add or rename portfolios from the accounts page.
        </SettingsHint>

        {isLoading ? (
          <p className="text-sm text-muted-foreground py-2">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No accounts yet. Sync trades from TradingView.</p>
        ) : (
          accounts.map((account) => (
            <AccountListItem
              key={account.id}
              account={account}
              isActive={account.id === activeAccountId}
              onDeleted={() => void refresh()}
            />
          ))
        )}
      </div>
    </SettingsSection>
  )
}
