import { HudPanel } from "@/components/dashboard/hud-panel"

export function FundedRoadmapSkeleton() {
  return (
    <div className="space-y-6">
      <HudPanel className="h-24 animate-pulse bg-cyan-400/5">{null}</HudPanel>
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <HudPanel key={index} className="h-28 animate-pulse bg-cyan-400/5">
            {null}
          </HudPanel>
        ))}
      </div>
      <HudPanel className="h-64 animate-pulse bg-cyan-400/5">{null}</HudPanel>
      <div className="grid gap-4 md:grid-cols-2">
        <HudPanel className="h-56 animate-pulse bg-cyan-400/5">{null}</HudPanel>
        <HudPanel className="h-56 animate-pulse bg-cyan-400/5">{null}</HudPanel>
      </div>
    </div>
  )
}
