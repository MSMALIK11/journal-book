import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

/** Hard kill switch — set DELTA_LIVE_ENABLED=false to block all live orders. */
export function isServerLiveTradingBlocked(): boolean {
  return process.env.DELTA_LIVE_ENABLED === "false"
}

/** Live access is controlled by enabled accounts + order ticket — only server kill switch applies here. */
export async function isUserLiveTradingEnabled(_userId: string): Promise<boolean> {
  return !isServerLiveTradingBlocked()
}

export async function setUserLiveTradingEnabled(userId: string, enabled: boolean): Promise<boolean> {
  if (isServerLiveTradingBlocked() && enabled) {
    throw new Error("Live trading is disabled on this server")
  }
  await connectDB()
  await User.findByIdAndUpdate(userId, { $set: { deltaLiveTradingEnabled: enabled } })
  return enabled
}

export async function assertLiveTradingEnabled(_userId: string): Promise<void> {
  if (isServerLiveTradingBlocked()) {
    throw new Error("Live trading is disabled on this server")
  }
}
