"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { HelpCircle } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type FundedHelpTermId =
  | "one-r"
  | "expectancy"
  | "win-rate"
  | "average-rr"
  | "profit-factor"
  | "max-drawdown"
  | "worst-loss-streak"
  | "historical-streak"
  | "stress"
  | "confidence"
  | "happy-flow"
  | "reach-target"
  | "hit-dd-first"
  | "median-trades"
  | "p5-p95"
  | "p10-p90"
  | "monte-carlo"
  | "timeout"
  | "challenge-rules"
  | "profit-split"
  | "stage-badges"
  | "target-probability"

type HelpContextValue = {
  openHelp: (term?: FundedHelpTermId) => void
}

const HelpContext = createContext<HelpContextValue | null>(null)

function useFundedRoadmapHelp() {
  const ctx = useContext(HelpContext)
  if (!ctx) throw new Error("FundedRoadmapHelp must be used inside FundedRoadmapHelpProvider")
  return ctx
}

const HOW_TO_USE = [
  "Pick an account in the sidebar. Every number on this page comes from that account’s closed trades.",
  "Set risk % (or fixed $) and firm rules. The $5K → $1M ladder recalculates from those settings.",
  "Reach target % is not a guarantee. It is how many of 1,000 simulated futures hit the profit target first, using your past R-multiples.",
  "Do not risk more than 1R per trade. Breaking daily or max drawdown fails the challenge.",
]

const GLOSSARY: { id: FundedHelpTermId; term: string; meaning: string }[] = [
  {
    id: "one-r",
    term: "1R",
    meaning: "Your planned risk on one trade (for example $50). A +2R win is $100; a −1R loss is $50.",
  },
  {
    id: "expectancy",
    term: "Expectancy",
    meaning:
      "Average R per trade. +0.20R means that over a long run each trade is worth about 0.2R. Negative expectancy means no edge.",
  },
  {
    id: "win-rate",
    term: "Win rate",
    meaning: "Winning trades divided by closed trades in the current filter.",
  },
  {
    id: "average-rr",
    term: "Average RR",
    meaning: "Typical win size versus typical loss size, measured in R.",
  },
  {
    id: "profit-factor",
    term: "Profit factor",
    meaning: "Gross profit divided by gross loss. 1.0 is break-even. Above 1 means the sample made money.",
  },
  {
    id: "max-drawdown",
    term: "Max drawdown",
    meaning: "The deepest drop in equity in this history. It is not a promise of the next worst drop.",
  },
  {
    id: "worst-loss-streak",
    term: "Worst loss streak",
    meaning: "The longest run of consecutive losses in the filtered history.",
  },
  {
    id: "historical-streak",
    term: "Historical streak",
    meaning:
      "The same worst losing run from history. It is what already happened — not the maximum the future can do.",
  },
  {
    id: "stress",
    term: "Stress 1.5× / 2×",
    meaning:
      "What if that losing streak is 1.5× or 2× longer? The $ and % drawdown show whether your current 1R would break max DD. If it would, cut risk.",
  },
  {
    id: "confidence",
    term: "Stability / confidence",
    meaning:
      "How much sample you have (trade count, consistency). Low means too few trades — treat the projection as weak.",
  },
  {
    id: "happy-flow",
    term: "Happy flow",
    meaning: "Optimistic days-to-target if things go well. A best-case path, not a promise.",
  },
  {
    id: "reach-target",
    term: "Reach target %",
    meaning:
      "In 1,000 Monte Carlo runs, how often the profit target was hit before max drawdown. 99% means 990 of those sims — not that the market is 99% sure.",
  },
  {
    id: "hit-dd-first",
    term: "Hit max DD first %",
    meaning: "How often the simulated account hit max drawdown (fail) before the profit target.",
  },
  {
    id: "median-trades",
    term: "Median trades",
    meaning: "Typical number of trades to reach the target (the middle simulation).",
  },
  {
    id: "p5-p95",
    term: "P5 / P95",
    meaning:
      "Lucky-fast vs slow grind. P5 is the quickest 5% of sims; P95 is the slowest 5%. Plan around P95, not P5.",
  },
  {
    id: "p10-p90",
    term: "P10 / P90",
    meaning: "Best / worst 10% of simulations — less extreme than P5 / P95.",
  },
  {
    id: "monte-carlo",
    term: "Monte Carlo",
    meaning:
      "The app shuffles your past R list and plays 1,000 fake futures. High hit % is only those sims — it does not make the live market certain.",
  },
  {
    id: "timeout",
    term: "Timeout",
    meaning: "A sim that hit neither target nor max DD within 400 trades.",
  },
  {
    id: "challenge-rules",
    term: "Profit target / Max DD / Daily DD %",
    meaning: "Challenge rules you set. Profit target is the pass line; max / daily DD are fail lines.",
  },
  {
    id: "profit-split",
    term: "Profit split",
    meaning: "Your share of profit after you are funded (display only on this page).",
  },
  {
    id: "stage-badges",
    term: "Locked / Current / Ready / At Risk / Completed",
    meaning:
      "Where that account size sits on the $5K → $1M ladder. Current is the stage you are reading; At Risk means stress DD is close to the rule.",
  },
  {
    id: "target-probability",
    term: "Target probability",
    meaning:
      "The card that groups Reach target %, Hit max DD first, median trades, and P5 / P95 from the 1,000 simulations.",
  },
]

export function FundedRoadmapHelpProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState<FundedHelpTermId | undefined>()

  useEffect(() => {
    if (!open || !term) return
    const id = `funded-help-${term}`
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [open, term])

  return (
    <HelpContext.Provider
      value={{
        openHelp: (next) => {
          setTerm(next)
          setOpen(true)
        },
      }}
    >
      {children}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setTerm(undefined)
        }}
      >
        <DialogContent className="flex max-h-[min(80vh,40rem)] max-w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-white/10 px-6 py-4 pr-12 text-left">
            <DialogTitle>How Funded Roadmap works</DialogTitle>
            <DialogDescription>
              Short meanings for every term on this page. This is a projection from your closed trades, not a live
              funded account.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold tracking-wide text-cyan-200 uppercase">How to use</h3>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
                {HOW_TO_USE.map((line) => (
                  <li key={line} className="leading-relaxed">
                    {line}
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-6 space-y-3">
              <h3 className="text-xs font-semibold tracking-wide text-cyan-200 uppercase">What the numbers mean</h3>
              <dl className="space-y-3">
                {GLOSSARY.map((item) => (
                  <div
                    key={item.id}
                    id={`funded-help-${item.id}`}
                    className={cn(
                      "scroll-mt-3 rounded-lg border border-white/10 px-3 py-2",
                      term === item.id && "border-cyan-400/40 bg-cyan-400/5",
                    )}
                  >
                    <dt className="text-sm font-semibold text-cyan-100">{item.term}</dt>
                    <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="mt-6 space-y-2 pb-2">
              <h3 className="text-xs font-semibold tracking-wide text-cyan-200 uppercase">What to watch</h3>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li>Keep risk at 1R. If Stress 2× breaks max DD, lower the risk %.</li>
                <li>Plan time-to-target around P95, not the happy-flow or P5 number.</li>
                <li>Low confidence or fewer than 100 trades: treat every % as a sketch, not a plan.</li>
                <li>Hit max DD first % is the fail rate in the sims — that is the number to respect.</li>
              </ul>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </HelpContext.Provider>
  )
}

export function FundedRoadmapHelpButton({ className }: { className?: string }) {
  const { openHelp } = useFundedRoadmapHelp()
  return (
    <button
      type="button"
      onClick={() => openHelp()}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400/25 text-cyan-200 transition-colors hover:bg-cyan-400/10",
        className,
      )}
      aria-label="How Funded Roadmap works"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  )
}

export function FundedRoadmapTermHelp({
  term,
  label,
  className,
}: {
  term: FundedHelpTermId
  label?: string
  className?: string
}) {
  const { openHelp } = useFundedRoadmapHelp()
  return (
    <button
      type="button"
      onClick={() => openHelp(term)}
      className={cn(
        "inline-flex rounded-full p-0.5 text-muted-foreground transition-colors hover:text-cyan-200",
        className,
      )}
      aria-label={label || `What is ${term.replace(/-/g, " ")}?`}
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
  )
}
