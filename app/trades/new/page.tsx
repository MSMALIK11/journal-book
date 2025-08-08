import { Sidebar } from "@/components/layout/sidebar"
import { TradeForm } from "@/components/trades/trade-form"

export default function NewTradePage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1  p-4 lg:p-8">
        <div className="space-y-6">
          <TradeForm  />
        </div>
      </div>
    </div>
  )
}
