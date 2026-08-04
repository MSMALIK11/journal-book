"use client"

import Link from "next/link"
import { Check, ChevronsUpDown, Layers, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useActiveAccount } from "@/hooks/use-active-account"

export function AccountSwitcher({ className }: { className?: string }) {
  const { accounts, activeAccount, isLoading, switchAccount } = useActiveAccount()

  if (isLoading) {
    return (
      <div className={cn("px-3 py-2 text-xs text-muted-foreground", className)}>
        Loading accounts...
      </div>
    )
  }

  if (!accounts.length) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-full justify-between bg-transparent text-left font-normal", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <Layers className="h-4 w-4 shrink-0" />
            <span className="truncate">{activeAccount?.name ?? "Select account"}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Trading accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map((account) => (
          <DropdownMenuItem
            key={account.id}
            className="flex items-center justify-between gap-2"
            onClick={() => void switchAccount(account.id)}
          >
            <span className="truncate">
              {account.name}
              {typeof account.tradeCount === "number" ? ` (${account.tradeCount})` : ""}
              {account.isDefault ? " · default" : ""}
            </span>
            {account.id === activeAccount?.id ? <Check className="h-4 w-4" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/accounts" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Manage accounts
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
