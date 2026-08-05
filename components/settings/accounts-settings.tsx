"use client"

import Link from "next/link"
import { Trash2 } from "lucide-react"
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="flex items-start justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{account.name}</p>
          {account.isDefault ? (
            <Badge variant="secondary" className="text-xs">
              Default
            </Badge>
          ) : null}
          {isActive ? (
            <Badge variant="outline" className="text-xs">
              Active
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {account.symbols.length ? account.symbols.join(", ") : "No symbols"}
        </p>
        <p className="text-sm text-muted-foreground">
          {tradeCount} trade{tradeCount === 1 ? "" : "s"}
        </p>
      </div>

      {canDelete ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={deleting} aria-label={`Delete ${account.name}`}>
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

  if (isLoading) {
    return <p className="text-muted-foreground">Loading accounts...</p>
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trading accounts</CardTitle>
        <CardDescription>
          All portfolios under your login. Deleting an account also removes its trade records.
          {" "}
          <Link href="/accounts" className="text-primary underline-offset-4 hover:underline">
            Manage symbols & create accounts
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No accounts yet. Sync trades from TradingView.</p>
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
      </CardContent>
    </Card>
  )
}
