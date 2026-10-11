import { Suspense } from "react"
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard"
import { AnalyticsDashboardSkeleton } from "@/components/analytics/analytics-dashboard-skeleton"

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<AnalyticsDashboardSkeleton />}>
      <AnalyticsDashboard />
    </Suspense>
  )
}
