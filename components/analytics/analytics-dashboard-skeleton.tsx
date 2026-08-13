"use client"

import { Skeleton } from "@/components/ui/skeleton"

export function AnalyticsDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="hud-panel px-4 py-3">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-48 bg-cyan-400/10" />
          <Skeleton className="h-9 w-32 bg-cyan-400/10" />
          <Skeleton className="h-9 w-40 bg-cyan-400/10" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-xl bg-cyan-400/10" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl bg-cyan-400/10" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl bg-cyan-400/10" />
      <Skeleton className="h-64 w-full rounded-xl bg-cyan-400/10" />
    </div>
  )
}
