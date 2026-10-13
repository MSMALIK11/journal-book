import { deltaApiPath, type DeltaEnvironment } from "@/components/delta/delta-shared"
import type { DeltaTradeMode } from "@/components/delta/delta-account-selector"
import type { DeltaAutoTradeConfig } from "@/lib/delta/auto-trade-settings"
import { authFetch } from "@/lib/client-auth"

export type AutoTradeRoutingPayload = {
  tradeMode: DeltaTradeMode
  singleAccountId?: string | null
  broadcastAccountIds: string[]
}

export async function persistAutoTradeRouting(
  environment: DeltaEnvironment,
  routing: AutoTradeRoutingPayload,
): Promise<DeltaAutoTradeConfig> {
  const response = await authFetch(deltaApiPath("/api/delta/auto-trade-settings", environment), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tradeMode: routing.tradeMode,
      singleAccountId: routing.singleAccountId ?? undefined,
      broadcastAccountIds: routing.broadcastAccountIds,
    }),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new Error(typeof data.error === "string" ? data.error : "Failed to save auto-trade routing")
  }
  return data.config as DeltaAutoTradeConfig
}
