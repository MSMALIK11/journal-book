import { cn } from "@/lib/utils"

type NeonPulseLoaderProps = {
  /** Status line below candles — e.g. CONNECTING... */
  status?: string
  className?: string
  /** Route-level loader: fills main content area (use in app/loading.tsx) */
  page?: boolean
  /** Inline panel loader (dashboard sections, modals) */
  fullScreen?: boolean
}

export function NeonPulseLoader({
  status = "CONNECTING...",
  className,
  page = false,
  fullScreen = false,
}: NeonPulseLoaderProps) {
  return (
    <div
      className={cn(
        "neon-pulse-loader flex flex-col items-center justify-center gap-4",
        page && "min-h-[calc(100vh-5rem)] w-full",
        fullScreen && !page && "min-h-[50vh] w-full",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={status}
    >
      <div className="neon-candles-row" aria-hidden>
        <div className="neon-bar green" />
        <div className="neon-bar red" />
        <div className="neon-bar green" />
      </div>
      <div className="neon-status-text">{status}</div>
    </div>
  )
}
