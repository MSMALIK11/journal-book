import "server-only"

import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

/** How long after last ping/sync we still show "Extension connected". */
export function connectedThresholdMs(pollIntervalSeconds?: number | null) {
  const intervalMs = (pollIntervalSeconds || 30) * 1000
  return Math.max(5 * 60_000, intervalMs * 4)
}

export async function touchSyncHeartbeat(userId: string, pollIntervalSeconds?: number) {
  await connectDB()
  const update: Record<string, unknown> = {
    sync_last_heartbeat: new Date(),
  }
  if (pollIntervalSeconds !== undefined) {
    update.sync_poll_interval_seconds = pollIntervalSeconds
  }
  await User.findByIdAndUpdate(userId, { $set: update })
}
