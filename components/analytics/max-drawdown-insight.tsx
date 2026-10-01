"use client"

import { AlertTriangle } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MaxDrawdownEpisode } from "@/lib/trading/analytics"
import { formatTradeEntryDateTime, tradeSideLabel } from "@/lib/trading/trade-display"
import { cn } from "@/lib/utils"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
})

type Props = {
  episode: MaxDrawdownEpisode | null
  maxDrawdown: number
  maxDrawdownPct: number
}

export function MaxDrawdownInsight({ episode, maxDrawdown, maxDrawdownPct }: Props) {
  if (!episode || maxDrawdown <= 0) {
    return (
      <HudPanel className="p-5">
        <p className="text-sm font-semibold">Max Drawdown</p>
        <p className="mt-1 text-xs text-muted-foreground">No drawdown recorded for this filter yet.</p>
      </HudPanel>
    )
  }

  return (
    <HudPanel glow="red">
      <HudPanelHeader
        title="Max Drawdown breakdown"
        description={`${currency.format(maxDrawdown)} (${maxDrawdownPct.toFixed(1)}% from peak)`}
        action={<AlertTriangle className="h-4 w-4 text-rose-400" />}
      />

      <div className="space-y-4 px-4 pb-4">
        <div className="rounded-lg border border-rose-400/20 bg-rose-500/5 px-4 py-3 text-sm leading-relaxed text-rose-100/90">
          {episode.reason}
        </div>

        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-cyan-400/20">
            Peak equity {currency.format(episode.peakEquity)}
            {episode.peakDate ? ` · ${formatTradeEntryDateTime(episode.peakDate)}` : " · before first trade"}
          </Badge>
          <Badge variant="outline" className="border-rose-400/30 text-rose-300">
            Trough {currency.format(episode.troughEquity)} · {formatTradeEntryDateTime(episode.troughDate)}
          </Badge>
          <Badge variant="outline" className="border-cyan-400/20">
            {episode.trades.length} trade{episode.trades.length === 1 ? "" : "s"} in this drawdown
          </Badge>
        </div>

        {episode.trades.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-cyan-400/10">
            <Table>
              <TableHeader>
                <TableRow className="border-cyan-400/10 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Exit time</TableHead>
                  <TableHead className="text-muted-foreground">Symbol</TableHead>
                  <TableHead className="text-muted-foreground">Side</TableHead>
                  <TableHead className="text-muted-foreground">P&amp;L</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {episode.trades.map((trade) => (
                  <TableRow key={trade.id || `${trade.instrument}-${trade.exit_date}`} className="border-cyan-400/10">
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatTradeEntryDateTime(trade.exit_date || trade.entry_date)}
                    </TableCell>
                    <TableCell className="font-medium">{trade.instrument}</TableCell>
                    <TableCell>
                      <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                        {tradeSideLabel(trade.trade_type as "Buy" | "Sell")}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "tabular-nums font-medium",
                        trade.net_pnl >= 0 ? "text-emerald-400" : "text-rose-400",
                      )}
                    >
                      {currency.format(trade.net_pnl)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </HudPanel>
  )
}
