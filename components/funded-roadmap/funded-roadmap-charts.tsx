"use client"

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { FundedRoadmapModel } from "@/lib/trading/funded-roadmap"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

const scalingConfig: ChartConfig = { size: { label: "Account", color: "#22d3ee" } }
const equityConfig: ChartConfig = { equity: { label: "Projected equity", color: "#34d399" } }
const histConfig: ChartConfig = { count: { label: "Sims", color: "#22d3ee" } }
const riskConfig: ChartConfig = {
  targetHitPct: { label: "Target hit %", color: "#34d399" },
  breachPct: { label: "DD breach %", color: "#f43f5e" },
}

export function FundedRoadmapCharts({ model }: { model: FundedRoadmapModel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <HudPanel>
        <HudPanelHeader title="Account scaling curve" description="Statistical $5K → $1M ladder" />
        <div className="p-4">
          <ChartContainer config={scalingConfig} className="aspect-[16/8]">
            <LineChart data={model.scalingCurve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis tickFormatter={(value) => currency.format(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="size" stroke="var(--color-size)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader
          title="Projected equity path"
          description="Historical R sequence applied to the current account size — not a forecast of future prices."
        />
        <div className="p-4">
          <ChartContainer config={equityConfig} className="aspect-[16/8]">
            <LineChart data={model.projectedEquity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="trade" />
              <YAxis tickFormatter={(value) => currency.format(Number(value))} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="equity" stroke="var(--color-equity)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader title="Trades-to-target distribution" description="Monte Carlo P5 / median / P95 live in the probability card" />
        <div className="p-4">
          <ChartContainer config={histConfig} className="aspect-[16/8]">
            <BarChart data={model.tradesToTargetHist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </HudPanel>

      <HudPanel>
        <HudPanelHeader title="Drawdown distribution" description="Peak-to-trough R from the same simulations" />
        <div className="p-4">
          <ChartContainer config={histConfig} className="aspect-[16/8]">
            <BarChart data={model.drawdownHist}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="#f43f5e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </HudPanel>

      <HudPanel className="xl:col-span-2">
        <HudPanelHeader
          title="Risk comparison"
          description="Same strategy, different risk %. Breach % is the chance max DD is hit before the profit target."
        />
        <div className="p-4">
          <ChartContainer config={riskConfig} className="aspect-[21/7]">
            <BarChart data={model.riskComparison}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="riskPercent" tickFormatter={(value) => `${value}%`} />
              <YAxis />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="targetHitPct" fill="var(--color-targetHitPct)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="breachPct" fill="var(--color-breachPct)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      </HudPanel>
    </div>
  )
}
