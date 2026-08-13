"use client"

import { Sparkles, TrendingDown } from "lucide-react"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import type { ResearchRecommendation } from "@/lib/trading/research"

type Props = {
  recommendations: ResearchRecommendation[]
}

export function ResearchInsights({ recommendations }: Props) {
  if (!recommendations.length) {
    return (
      <HudPanel className="p-8 text-center text-sm text-muted-foreground">
        Need more closed trades to generate pattern insights. Try widening the date range or syncing
        more trades from Live Sync.
      </HudPanel>
    )
  }

  const edges = recommendations.filter((r) => r.type === "edge")
  const leaks = recommendations.filter((r) => r.type === "leak")

  return (
    <div className="space-y-6">
      {edges.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-emerald-400">
            <Sparkles className="h-4 w-4" />
            Your edge — repeat these
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {edges.map((item) => (
              <InsightCard key={item.title + item.metric} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {leaks.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-rose-400">
            <TrendingDown className="h-4 w-4" />
            Leaks — avoid or fix these
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            {leaks.map((item) => (
              <InsightCard key={item.title + item.metric} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function InsightCard({ item }: { item: ResearchRecommendation }) {
  return (
    <HudPanel glow={item.type === "edge" ? "green" : "red"}>
      <HudPanelHeader title={item.title} description={item.detail} />
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-cyan-100">{item.metric}</p>
      </div>
    </HudPanel>
  )
}
