import { Sidebar } from "@/components/layout/sidebar"
import { TradingCalendar } from "@/components/calendar/trading-calendar"

export default function CalendarPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-4 lg:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Trading Calendar</h1>
            <p className="text-muted-foreground">View your trades organized by date</p>
          </div>
          <TradingCalendar />
        </div>
      </div>
    </div>
  )
}
