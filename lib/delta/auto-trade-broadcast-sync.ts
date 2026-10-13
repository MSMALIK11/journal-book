import mongoose from "mongoose"
import User from "@/app/api/models/User"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import {
  getDeltaAutoTradeConfig,
  normalizeDeltaAutoTradeConfig,
  type DeltaAutoTradePreferences,
} from "@/lib/delta/auto-trade-settings"

/** New or re-enabled accounts join TV auto-trade broadcast list automatically. */
export async function appendAccountToAutoTradeBroadcast(
  userId: string,
  environment: DeltaEnvironment,
  accountId: string,
): Promise<void> {
  const user = await User.findById(userId).select("deltaAutoTradePreferences").lean()
  if (!user) return

  const config = getDeltaAutoTradeConfig(user.deltaAutoTradePreferences, environment)
  if (config.tradeMode !== "broadcast") return

  const current = config.broadcastAccountIds ?? []
  if (current.includes(accountId)) return

  const next = normalizeDeltaAutoTradeConfig({
    ...config,
    broadcastAccountIds: [...current, accountId],
  })

  const prefs: DeltaAutoTradePreferences = {
    ...(user.deltaAutoTradePreferences ?? {}),
    [environment]: next,
  }

  await User.findByIdAndUpdate(new mongoose.Types.ObjectId(userId), {
    $set: { deltaAutoTradePreferences: prefs },
  })
}

export function enabledAccountsMissingFromBroadcast(input: {
  enabledAccountIds: string[]
  broadcastAccountIds: string[]
  tradeMode: "single" | "broadcast"
  singleAccountId?: string | null
}): string[] {
  if (input.tradeMode === "single") {
    const target = input.singleAccountId
    if (!target) return input.enabledAccountIds
    return input.enabledAccountIds.filter((id) => id !== target)
  }
  const selected = new Set(input.broadcastAccountIds)
  return input.enabledAccountIds.filter((id) => !selected.has(id))
}
