import connectDB from "@/app/api/db/mongoose"
import type { DeltaAutoTradeAccountResult, DeltaAutoTradeLogStatus } from "@/app/api/models/DeltaAutoTradeLog"
import type { DeltaEnvironment } from "@/lib/broker/delta-env"
import { persistAlerts } from "@/lib/trading/alerts-server"

export const DELTA_DEMO_ALERT_ACCOUNT = "delta:demo"
export const DELTA_LIVE_ALERT_ACCOUNT = "delta:live"

export function deltaAlertAccountId(environment: DeltaEnvironment): string {
  return environment === "live" ? DELTA_LIVE_ALERT_ACCOUNT : DELTA_DEMO_ALERT_ACCOUNT
}

export function isDeltaAlertAccountId(accountId: string): boolean {
  return accountId === DELTA_DEMO_ALERT_ACCOUNT || accountId === DELTA_LIVE_ALERT_ACCOUNT
}

type DeltaTradeNotificationInput = {
  source: "auto" | "manual"
  kind?: "open" | "close"
  tvTradeId?: string
  symbol?: string
  side?: string
  lots?: number
  status: DeltaAutoTradeLogStatus
  accountResults?: DeltaAutoTradeAccountResult[]
  error?: string
  orderId?: string
}

function sideLabel(side?: string): string {
  if (!side) return ""
  return side === "buy" ? "Long" : side === "sell" ? "Short" : side
}

function failedAccountResults(accountResults?: DeltaAutoTradeAccountResult[]): DeltaAutoTradeAccountResult[] {
  return (accountResults ?? []).filter((r) => !r.ok)
}

function accountResultContext(
  environment: DeltaEnvironment,
  input: DeltaTradeNotificationInput,
  result: DeltaAutoTradeAccountResult,
  allFailed: DeltaAutoTradeAccountResult[],
) {
  return {
    source: "delta",
    environment,
    accountLabel: result.label,
    accountId: result.accountId,
    symbol: input.symbol,
    kind: input.kind,
    side: input.side,
    lots: input.lots,
    tradeSource: input.source,
    status: input.status,
    tvTradeId: input.tvTradeId,
    accountResults: allFailed.map((row) => ({
      accountId: row.accountId,
      label: row.label,
      ok: row.ok,
      error: row.error,
    })),
  }
}

function pushPerAccountAlerts(
  payloads: Parameters<typeof persistAlerts>[2],
  input: {
    source: DeltaTradeNotificationInput["source"]
    kind?: DeltaTradeNotificationInput["kind"]
    symbol?: string
    side?: string
    lots?: number
    status: DeltaAutoTradeLogStatus
    tvTradeId?: string
  },
  environment: DeltaEnvironment,
  baseKey: string,
  failedAccounts: DeltaAutoTradeAccountResult[],
) {
  for (const result of failedAccounts) {
    payloads.push({
      key: `${baseKey}:${result.accountId}:${input.kind ?? "trade"}`,
      category: "delta_trade",
      severity:
        result.error?.toLowerCase().includes("margin") || result.error?.toLowerCase().includes("credential")
          ? "warning"
          : "danger",
      title: `${input.source === "auto" ? "Auto trade" : "Order"} failed · ${result.label}`,
      message: result.error ?? "Trade failed on this account",
      metric: input.symbol,
      action: "Check this account's margin and API keys in Delta trading.",
      context: accountResultContext(environment, input as DeltaTradeNotificationInput, result, failedAccounts),
      priority: 250,
    })
  }
}

export async function persistDeltaTradeNotifications(
  userId: string,
  environment: DeltaEnvironment,
  input: DeltaTradeNotificationInput,
) {
  if (input.status === "success") return

  await connectDB()
  const accountId = deltaAlertAccountId(environment)
  const envLabel = environment === "live" ? "Live" : "Demo"
  const payloads: Parameters<typeof persistAlerts>[2] = []
  const baseKey =
    input.source === "auto" ? `delta-auto:${input.tvTradeId ?? "unknown"}` : `delta-manual:${input.orderId ?? Date.now()}`

  const failedAccounts = failedAccountResults(input.accountResults)
  const kindLabel = input.kind ? input.kind.charAt(0).toUpperCase() + input.kind.slice(1) : "Trade"

  if (input.status === "skipped" || input.status === "failed") {
    if (failedAccounts.length > 0) {
      pushPerAccountAlerts(payloads, input, environment, baseKey, failedAccounts)
    } else if (input.error) {
      payloads.push({
        key: `${baseKey}:summary`,
        category: "delta_trade",
        severity: input.error.toLowerCase().includes("margin") ? "warning" : "danger",
        title: `${input.source === "auto" ? "Auto trade" : "Order"} ${kindLabel.toLowerCase()} ${input.status} · ${input.symbol ?? envLabel}`,
        message: input.error,
        metric: input.symbol,
        action: "Review margin and accounts in Delta trading.",
        context: {
          source: "delta",
          environment,
          symbol: input.symbol,
          kind: input.kind,
          side: input.side,
          lots: input.lots,
          tradeSource: input.source,
          status: input.status,
          tvTradeId: input.tvTradeId,
        },
        priority: 240,
      })
    }
  }

  if (input.status === "partial") {
    const okCount = (input.accountResults ?? []).filter((r) => r.ok).length
    const total = input.accountResults?.length ?? 0
    payloads.push({
      key: `${baseKey}:summary`,
      category: "delta_trade",
      severity: "warning",
      title: `${okCount}/${total} accounts filled · ${envLabel}`,
      message: `${input.symbol ?? "Trade"} ${sideLabel(input.side)}${input.lots ? ` · ${input.lots} Lot` : ""}`,
      metric: input.symbol,
      action: "Review per-account results below.",
      context: {
        source: "delta",
        environment,
        symbol: input.symbol,
        kind: input.kind,
        side: input.side,
        lots: input.lots,
        tradeSource: input.source,
        okCount,
        total,
        accountResults: failedAccounts.map((row) => ({
          accountId: row.accountId,
          label: row.label,
          ok: row.ok,
          error: row.error,
        })),
      },
      priority: 240,
    })

    pushPerAccountAlerts(payloads, input, environment, baseKey, failedAccounts)
  }

  if (payloads.length === 0) return
  await persistAlerts(userId, accountId, payloads)
}
