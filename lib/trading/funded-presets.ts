export type RiskMode = "percent" | "fixed"

export type FundedChallengeRules = {
  profitTargetPct: number
  maxDrawdownPct: number
  dailyDrawdownPct: number
  minTradingDays: number
  profitSplitPct: number
}

export type FundedAccountLevel = {
  id: string
  size: number
  label: string
  shortLabel: string
}

export type FundedFirmPreset = {
  id: string
  name: string
  rules: FundedChallengeRules
}

export const DEFAULT_FUNDED_RULES: FundedChallengeRules = {
  profitTargetPct: 10,
  maxDrawdownPct: 10,
  dailyDrawdownPct: 5,
  minTradingDays: 5,
  profitSplitPct: 80,
}

export const FUNDED_FIRM_PRESETS: FundedFirmPreset[] = [
  { id: "generic", name: "Generic challenge", rules: DEFAULT_FUNDED_RULES },
  {
    id: "conservative",
    name: "Conservative prop",
    rules: {
      profitTargetPct: 8,
      maxDrawdownPct: 8,
      dailyDrawdownPct: 4,
      minTradingDays: 5,
      profitSplitPct: 80,
    },
  },
  {
    id: "standard",
    name: "Standard prop",
    rules: {
      profitTargetPct: 10,
      maxDrawdownPct: 10,
      dailyDrawdownPct: 5,
      minTradingDays: 4,
      profitSplitPct: 80,
    },
  },
]

export const FUNDED_ACCOUNT_LADDER: FundedAccountLevel[] = [
  { id: "5k", size: 5_000, label: "$5,000", shortLabel: "$5K" },
  { id: "10k", size: 10_000, label: "$10,000", shortLabel: "$10K" },
  { id: "25k", size: 25_000, label: "$25,000", shortLabel: "$25K" },
  { id: "50k", size: 50_000, label: "$50,000", shortLabel: "$50K" },
  { id: "100k", size: 100_000, label: "$100,000", shortLabel: "$100K" },
  { id: "250k", size: 250_000, label: "$250,000", shortLabel: "$250K" },
  { id: "500k", size: 500_000, label: "$500,000", shortLabel: "$500K" },
  { id: "1m", size: 1_000_000, label: "$1,000,000", shortLabel: "$1M" },
]

export const RISK_PERCENT_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const

export const RISK_COMPARISON_PERCENTS = [0.5, 1, 1.5, 2] as const

export function formatAccountSize(size: number) {
  if (size >= 1_000_000) return `$${(size / 1_000_000).toFixed(size % 1_000_000 === 0 ? 0 : 1)}M`
  if (size >= 1_000) return `$${(size / 1_000).toFixed(size % 1_000 === 0 ? 0 : 1)}K`
  return `$${size.toLocaleString("en-US")}`
}
