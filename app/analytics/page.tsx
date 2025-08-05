import { Sidebar } from "@/components/layout/sidebar"
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard"

export default function AnalyticsPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1  p-4 lg:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Analytics Dashboard</h1>
            <p className="text-muted-foreground">Analyze your trading performance and patterns</p>
          </div>
          <AnalyticsDashboard />
        </div>
      </div>
    </div>
  )
}
