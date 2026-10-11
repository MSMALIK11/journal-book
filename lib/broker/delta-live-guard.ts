import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"

/** Hard kill switch — set DELTA_LIVE_ENABLED=false to block all live orders. */
export function isServerLiveTradingBlocked(): boolean {
  return process.env.DELTA_LIVE_ENABLED === "false"
}

/** Per-user live opt-in — must be explicitly enabled on the Delta Live page. */
export async function isUserLiveTradingEnabled(userId: string): Promise<boolean> {
  if (isServerLiveTradingBlocked()) return false
  await connectDB()
  const user = await User.findById(userId).select("deltaLiveTradingEnabled").lean()
  return user?.deltaLiveTradingEnabled === true
}

export async function setUserLiveTradingEnabled(userId: string, enabled: boolean): Promise<boolean> {
  if (isServerLiveTradingBlocked() && enabled) {
    throw new Error("Live trading is disabled on this server")
  }
  await connectDB()
  await User.findByIdAndUpdate(userId, { $set: { deltaLiveTradingEnabled: enabled } })
  return enabled
}

export async function assertLiveTradingEnabled(userId: string): Promise<void> {
  if (isServerLiveTradingBlocked()) {
    throw new Error("Live trading is disabled on this server")
  }
  const enabled = await isUserLiveTradingEnabled(userId)
  if (!enabled) {
    throw new Error("Enable live trading on the Delta Live page before placing orders")
  }
}
