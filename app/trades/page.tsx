import { Sidebar } from "@/components/layout/sidebar"
import { TradeHistory } from "@/components/trades/trade-history"

export default function TradesPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1  p-4 lg:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Trade History</h1>
            <p className="text-muted-foreground">View and manage all your trades</p>
          </div>
          <TradeHistory />
        </div>
      </div>
    </div>
  )
}
