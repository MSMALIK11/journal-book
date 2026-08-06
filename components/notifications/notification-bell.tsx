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
import { cn } from "@/lib/utils"

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { activeAccount } = useActiveAccount()
  const { active, history, unreadCount, verdict, isLoading, markRead } = useTradingAlerts()

  async function handleHistoryClick(id: string) {
    await markRead({ ids: [id] })
  }

  async function handleMarkAllRead() {
    await markRead({ all: true })
  }

  const hasUrgent = verdict?.level === "stop" || active.some((a) => a.severity === "danger")

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label="Trading alerts">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 || hasUrgent ? (
            <span
              className={cn(
                "absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
                hasUrgent ? "bg-rose-500" : "bg-rose-500",
              )}
            >
              {unreadCount > 0 ? (unreadCount > 9 ? "9+" : unreadCount) : "!"}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="border-b px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Alerts</p>
              <p className="text-xs text-muted-foreground">{activeAccount?.name || "Account"}</p>
            </div>
            {unreadCount > 0 ? (
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void handleMarkAllRead()}>
                Clear all
              </Button>
            ) : null}
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
              <TabsTrigger value="history">
                History
                {unreadCount > 0 ? (
                  <span className="ml-1 rounded-full bg-rose-500/15 px-1.5 text-[10px] text-rose-600">
                    {unreadCount}
                  </span>
                ) : null}
              </TabsTrigger>
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
              <AlertList
                items={history}
                emptyMessage="No past alerts yet."
                onItemClick={(item) => {
                  if (!item.read && item.id) void handleHistoryClick(item.id)
                }}
              />
            )}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  )
}
