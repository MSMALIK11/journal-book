import { cn } from "@/lib/utils"

export function Sparkline({
  values,
  color,
  className,
}: {
  values: number[]
  color: string
  className?: string
}) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100
      const y = 26 - ((value - min) / span) * 22
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(" ")

  return (
    <svg viewBox="0 0 100 32" className={cn("h-10 w-24 overflow-visible", className)} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MiniBars({
  values,
  color = "#22d3ee",
  className,
}: {
  values: number[]
  color?: string
  className?: string
}) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const width = 100 / values.length

  return (
    <svg viewBox="0 0 100 32" className={cn("h-10 w-24", className)} aria-hidden>
      {values.map((value, index) => {
        const height = Math.max(2, (value / max) * 28)
        return (
          <rect
            key={index}
            x={index * width + 1}
            y={32 - height}
            width={Math.max(2, width - 2)}
            height={height}
            rx="0.8"
            fill={color}
            opacity={0.85}
          />
        )
      })}
    </svg>
  )
}

export function WinRateRing({ value }: { value: number }) {
  const radius = 26
  const circumference = 2 * Math.PI * radius
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * circumference

  return (
    <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={radius} fill="none" stroke="rgba(34,211,238,0.12)" strokeWidth="6" />
      <circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="#22d3ee"
        strokeWidth="6"
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
      />
    </svg>
  )
}
