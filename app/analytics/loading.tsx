import { AnalyticsDashboardSkeleton } from "@/components/analytics/analytics-dashboard-skeleton"

export default function Loading() {
  return (
    <div className="flex-1 lg:ml-64 p-4 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-2">
          <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
          <div className="h-5 w-72 animate-pulse rounded-md bg-muted" />
        </div>
        <AnalyticsDashboardSkeleton />
      </div>
    </div>
  )
}
