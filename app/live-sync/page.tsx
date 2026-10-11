import { Suspense } from "react"
import { LiveSyncDashboard } from "@/components/sync/live-sync-dashboard"

export default function LiveSyncPage() {
  return (
    <Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">Loading live sync…</div>}>
      <LiveSyncDashboard />
    </Suspense>
  )
}
