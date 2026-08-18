export type MonteCarloOptions = {
  targetR: number
  maxDrawdownR: number
  simulations?: number
  maxTrades?: number
}

export type MonteCarloResult = {
  simulations: number
  targetHitPct: number
  drawdownFirstPct: number
  timeoutPct: number
  medianTradesToTarget: number | null
  p5TradesToTarget: number | null
  p10TradesToTarget: number | null
  p90TradesToTarget: number | null
  p95TradesToTarget: number | null
  medianMaxDrawdownR: number
  p95MaxDrawdownR: number
  tradesToTarget: number[]
  maxDrawdownsR: number[]
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return null
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))
  return sorted[index]
}

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

export function runMonteCarlo(rMultiples: number[], options: MonteCarloOptions): MonteCarloResult {
  const simulations = options.simulations ?? 1000
  const maxTrades = options.maxTrades ?? 400
  const targetR = options.targetR
  const maxDrawdownR = options.maxDrawdownR
  const usable = rMultiples.filter((value) => Number.isFinite(value))

  const empty: MonteCarloResult = {
    simulations: 0,
    targetHitPct: 0,
    drawdownFirstPct: 0,
    timeoutPct: 0,
    medianTradesToTarget: null,
    p5TradesToTarget: null,
    p10TradesToTarget: null,
    p90TradesToTarget: null,
    p95TradesToTarget: null,
    medianMaxDrawdownR: 0,
    p95MaxDrawdownR: 0,
    tradesToTarget: [],
    maxDrawdownsR: [],
  }

  if (!usable.length || !(targetR > 0) || !(maxDrawdownR > 0)) return empty

  const random = mulberry32(usable.length * 997 + Math.round(targetR * 100) + Math.round(maxDrawdownR * 100))
  const tradesToTarget: number[] = []
  const maxDrawdownsR: number[] = []
  let hits = 0
  let breaches = 0
  let timeouts = 0

  for (let sim = 0; sim < simulations; sim++) {
    let equityR = 0
    let peakR = 0
    let maxDdR = 0
    let outcome: "hit" | "breach" | "timeout" = "timeout"

    for (let i = 0; i < maxTrades; i++) {
      equityR += usable[Math.floor(random() * usable.length)]
      if (equityR > peakR) peakR = equityR
      const drawdownR = peakR - equityR
      if (drawdownR > maxDdR) maxDdR = drawdownR

      if (drawdownR >= maxDrawdownR) {
        outcome = "breach"
        break
      }
      if (equityR >= targetR) {
        outcome = "hit"
        tradesToTarget.push(i + 1)
        break
      }
    }

    maxDrawdownsR.push(maxDdR)
    if (outcome === "hit") hits += 1
    else if (outcome === "breach") breaches += 1
    else timeouts += 1
  }

  const sortedTrades = [...tradesToTarget].sort((a, b) => a - b)
  const sortedDd = [...maxDrawdownsR].sort((a, b) => a - b)

  return {
    simulations,
    targetHitPct: (hits / simulations) * 100,
    drawdownFirstPct: (breaches / simulations) * 100,
    timeoutPct: (timeouts / simulations) * 100,
    medianTradesToTarget: percentile(sortedTrades, 50),
    p5TradesToTarget: percentile(sortedTrades, 5),
    p10TradesToTarget: percentile(sortedTrades, 10),
    p90TradesToTarget: percentile(sortedTrades, 90),
    p95TradesToTarget: percentile(sortedTrades, 95),
    medianMaxDrawdownR: percentile(sortedDd, 50) ?? 0,
    p95MaxDrawdownR: percentile(sortedDd, 95) ?? 0,
    tradesToTarget: sortedTrades,
    maxDrawdownsR: sortedDd,
  }
}

export function histogram(values: number[], buckets: number, min?: number, max?: number) {
  if (!values.length) return []
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  const counts = Array.from({ length: buckets }, (_, index) => {
    const start = lo + (span * index) / buckets
    const end = lo + (span * (index + 1)) / buckets
    return {
      start,
      end,
      label: `${start.toFixed(1)}–${end.toFixed(1)}`,
      count: 0,
    }
  })

  for (const value of values) {
    const idx = Math.min(buckets - 1, Math.max(0, Math.floor(((value - lo) / span) * buckets)))
    counts[idx].count += 1
  }
  return counts
}
