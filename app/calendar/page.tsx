import { TradingCalendar } from "@/components/calendar/trading-calendar"

export default function CalendarPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Performance review
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Trading Calendar</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          See your daily P&amp;L, identify trading patterns, and review every session in one place.
        </p>
      </div>
      <TradingCalendar />
    </div>
  )
}
