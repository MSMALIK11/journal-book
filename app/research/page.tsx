import { Sidebar } from "@/components/layout/sidebar"
import { ResearchDashboard } from "@/components/research/research-dashboard"

export default function ResearchPage() {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 p-4 lg:p-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Research</h1>
            <p className="text-muted-foreground">
              Discover your trading style, market rhythms, and behavioral patterns from your trade
              history
            </p>
          </div>
          <ResearchDashboard />
        </div>
      </div>
    </div>
  )
}
