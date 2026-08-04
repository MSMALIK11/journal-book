import { LiveSyncDashboard } from "@/components/sync/live-sync-dashboard"

export default function LiveSyncPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Live Sync</h1>
        <p className="text-muted-foreground">
          Real-time feed of trades synced from TradingView Strategy Tester via the browser extension.
        </p>
      </div>
      <LiveSyncDashboard />
    </div>
  )
}
