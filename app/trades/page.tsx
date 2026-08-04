import { TradeHistory } from "@/components/trades/trade-history"

export default function TradesPage() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6">
      <div className="rounded-3xl border border-border/60 bg-card/70 p-6 shadow-sm backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Journal records
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Trade History</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View, filter, and manage your recorded trades.
        </p>
      </div>
      <TradeHistory />
    </div>
  )
}
