"use client"

import { useEffect, useState } from "react"
import { Plus } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { DeltaAccountManager } from "@/components/delta/delta-account-manager"
import type { DeltaAccountMarginEntry } from "@/components/delta/use-delta-account-margins"
import type { DeltaAccount, DeltaEnvironment } from "@/components/delta/delta-shared"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { DeltaAccountActivityRow } from "@/lib/delta/account-activity"

type DeltaIntegrationsTabProps = {
  environment: DeltaEnvironment
  accounts: DeltaAccount[]
  envOverride: boolean
  maxAccounts: number
  busy: string | null
  onBusyChange: (busy: string | null) => void
  marginEntries?: Record<string, DeltaAccountMarginEntry>
  accountActivity?: DeltaAccountActivityRow[]
  onViewAccountTrades?: () => void
  onAccountsChange: (accounts?: DeltaAccount[]) => void
}

export function DeltaIntegrationsTab({
  environment,
  accounts,
  envOverride,
  maxAccounts,
  busy,
  onBusyChange,
  marginEntries,
  accountActivity,
  onViewAccountTrades,
  onAccountsChange,
}: DeltaIntegrationsTabProps) {
  const canAdd = !envOverride && accounts.length < maxAccounts
  const [addModalOpen, setAddModalOpen] = useState(canAdd && accounts.length === 0)

  useEffect(() => {
    if (accounts.length === 0 && canAdd) {
      setAddModalOpen(true)
    }
  }, [accounts.length, canAdd])

  return (
    <HudPanel>
      <HudPanelHeader
        title="Accounts"
        description="Per-account open trades and P&L — use the By account tab"
        action={
          <div className="flex items-center gap-2">
            {onViewAccountTrades ? (
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={onViewAccountTrades}>
                By account trades
              </Button>
            ) : null}
            {canAdd ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setAddModalOpen(true)}
                    aria-label="Add account"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Add account</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        }
      />
      <div className="px-5 py-4">
        <DeltaAccountManager
          environment={environment}
          accounts={accounts}
          envOverride={envOverride}
          maxAccounts={maxAccounts}
          busy={busy}
          onBusyChange={onBusyChange}
          marginEntries={marginEntries}
          accountActivity={accountActivity}
          onViewAccountTrades={onViewAccountTrades}
          onAccountsChange={onAccountsChange}
          addModalOpen={addModalOpen}
          onAddModalOpenChange={setAddModalOpen}
        />
      </div>
    </HudPanel>
  )
}
