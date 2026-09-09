"use client"

import { cn } from "@/lib/utils"
import type { BrokerConnectionPublic, BrokerConnectionStatus } from "@/lib/broker/broker-config"

const STATUS_COPY: Record<BrokerConnectionStatus, string> = {
  not_connected: "Not connected",
  connecting: "Connecting...",
  connected: "Connected",
  error: "Connection error",
  unavailable: "MT5 worker is not configured",
}

export function ConnectionStatus({
  connection,
  pending,
}: {
  connection: BrokerConnectionPublic
  pending?: boolean
}) {
  const status: BrokerConnectionStatus = pending ? "connecting" : connection.status
  return (
    <div className="rounded-xl border border-cyan-400/15 bg-[#05070a]/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            status === "connected" && "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]",
            status === "connecting" && "bg-amber-400 animate-pulse",
            status === "error" && "bg-rose-400",
            status === "unavailable" && "bg-amber-500",
            (status === "not_connected" || !status) && "bg-zinc-500",
          )}
        />
        <p className="text-sm font-medium">
          {pending ? "Connecting..." : STATUS_COPY[status]}
        </p>
      </div>
      <dl className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>Broker: {connection.broker === "other" ? "Other" : "XM"}</div>
        <div>Platform: MetaTrader 5</div>
        <div>Account: {connection.loginMasked || "****"}</div>
        <div>Server: {connection.server || "—"}</div>
        <div className="sm:col-span-2">
          Last checked:{" "}
          {connection.lastCheckedAt ? new Date(connection.lastCheckedAt).toLocaleString() : "—"}
        </div>
        {connection.lastMessage ? (
          <div className="sm:col-span-2 text-muted-foreground">{connection.lastMessage}</div>
        ) : null}
      </dl>
    </div>
  )
}
