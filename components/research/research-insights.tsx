"use client"

import { Sparkles, TrendingDown } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { ResearchRecommendation } from "@/lib/trading/research"
import { cn } from "@/lib/utils"

type Props = {
  recommendations: ResearchRecommendation[]
}

export function ResearchInsights({ recommendations }: Props) {
  if (!recommendations.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Need more closed trades to generate pattern insights. Try widening the date range or syncing
          more trades from Live Sync.
        </CardContent>
      </Card>
    )
  }

  const edges = recommendations.filter((r) => r.type === "edge")
  const leaks = recommendations.filter((r) => r.type === "leak")

  return (
    <div className="space-y-6">
      {edges.length > 0 ? (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-emerald-600">
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
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-rose-600">
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
    <Card
      className={cn(
        item.type === "edge"
          ? "border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-amber-200/60 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/20",
      )}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{item.title}</CardTitle>
        <CardDescription>{item.detail}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-medium">{item.metric}</p>
      </CardContent>
    </Card>
  )
}
