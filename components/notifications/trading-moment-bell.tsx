"use client"

import { useState } from "react"
import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { AlertActionCard } from "@/components/notifications/alert-action-card"
import { CoachingVerdictCard } from "@/components/notifications/coaching-verdict-card"
import { TradingZonePanel } from "@/components/notifications/trading-zone-panel"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"
import { useActiveAccount } from "@/hooks/use-active-account"
import { cn } from "@/lib/utils"

export function TradingMomentBell() {
  const [open, setOpen] = useState(false)
  const { activeAccount } = useActiveAccount()
  const { topAction, zones, verdict, isLoading } = useTradingAlerts()

  const showAlertDot =
    !open && (verdict?.level === "stop" || verdict?.level === "caution" || zones?.overallZone === "red")

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Trading moment insights">
          <Sparkles className="h-4 w-4" />
          {showAlertDot ? (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background",
                verdict?.level === "stop" || zones?.overallZone === "red"
                  ? "bg-rose-500"
                  : "bg-amber-500",
              )}
            />
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Trading coach</p>
          <p className="text-xs text-muted-foreground">{activeAccount?.name || "Account"}</p>
        </div>

        <div className="p-3 pb-0">
          <CoachingVerdictCard verdict={verdict} loading={isLoading} />
        </div>

        <TradingZonePanel zones={zones} loading={isLoading} />
        <AlertActionCard alert={topAction} loading={isLoading} className="mb-3" />
      </PopoverContent>
    </Popover>
  )
}
