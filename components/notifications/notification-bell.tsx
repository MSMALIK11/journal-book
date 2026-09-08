"use client"

import { useState } from "react"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertList } from "@/components/notifications/alert-list"
import { CoachingVerdictCard } from "@/components/notifications/coaching-verdict-card"
import { useTradingAlerts } from "@/hooks/use-trading-alerts"
import { useActiveAccount } from "@/hooks/use-active-account"

function formatUnreadBadge(count: number): string {
  if (count > 9) return "9+"
  return String(count)
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { activeAccount } = useActiveAccount()
  const { active, history, unreadCount, verdict, isLoading, markRead } = useTradingAlerts()

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (isOpen && unreadCount > 0) {
      void markRead({ all: true })
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Trading alerts">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
              {formatUnreadBadge(unreadCount)}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Alerts</p>
            <p className="text-xs text-muted-foreground">{activeAccount?.name || "Account"}</p>
          </div>
        </div>

        <div className="border-b p-3">
          <CoachingVerdictCard verdict={verdict} loading={isLoading} compact />
        </div>

        <Tabs defaultValue="active" className="gap-0">
          <div className="border-b px-4 py-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="active">
                Now
                {active.length ? (
                  <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{active.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="active" className="p-3">
            {isLoading ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : (
              <AlertList items={active} emptyMessage="All clear — nothing flagged right now." />
            )}
          </TabsContent>

          <TabsContent value="history" className="p-3">
            {isLoading ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">Loading...</p>
            ) : (
              <AlertList items={history} emptyMessage="No past alerts yet." />
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
