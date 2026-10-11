import type { AnalyticsResult, BucketStats } from "@/lib/trading/analytics"

/** Escape a CSV cell: quote only when it contains a delimiter, quote, or newline. */
function cell(value: string | number | null | undefined): string {
  if (value == null) return ""
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(cell).join(",")
}

function bucketSection(title: string, buckets: BucketStats[]): string[] {
  const lines = ["", row([title]), row(["Name", "Trades", "Wins", "Losses", "Win %", "Avg P&L", "Net P&L", "Avg R", "Fee drag %"])]
  for (const b of buckets) {
    lines.push(
      row([
        b.label,
        b.trades,
        b.wins,
        b.losses,
        b.winRate.toFixed(1),
        b.avgPnl.toFixed(2),
        b.netPnl.toFixed(2),
        b.avgR == null ? "" : b.avgR.toFixed(3),
        b.feeDragPct == null ? "" : (b.feeDragPct * 100).toFixed(1),
      ]),
    )
  }
  return lines
}

/**
 * Build a spreadsheet-ready CSV from an analytics payload: a key-values summary
 * block plus one section per bucketed dimension. Runs entirely client-side.
 */
export function buildAnalyticsCsv(data: AnalyticsResult): string {
  const o = data.overview
  const lines: string[] = [
    row(["Journal Book — Analytics Export"]),
    row(["Generated", new Date().toISOString()]),
    row(["Attribution", o.attribution.mode]),
    row([]),
    row(["Summary"]),
    row(["Metric", "Value"]),
    row(["Closed trades", o.closedTrades]),
    row(["Wins", o.wins]),
    row(["Losses", o.losses]),
    row(["Break even", o.breakEven]),
    row(["Win rate %", o.winRate.toFixed(2)]),
    row(["Net P&L", o.netPnl.toFixed(2)]),
    row(["Gross profit", o.grossProfit.toFixed(2)]),
    row(["Gross loss", o.grossLoss.toFixed(2)]),
    row(["Profit factor", o.profitFactor == null ? "inf" : o.profitFactor.toFixed(3)]),
    row(["Expectancy", o.expectancy.toFixed(2)]),
    row(["Avg win", o.avgWin.toFixed(2)]),
    row(["Avg loss", o.avgLoss.toFixed(2)]),
    row(["Total commission", o.totalCommission.toFixed(2)]),
    row(["Max drawdown", o.maxDrawdown.toFixed(2)]),
    row(["Max drawdown %", o.maxDrawdownPct.toFixed(2)]),
    row(["Recovery factor", o.recoveryFactor == null ? "" : o.recoveryFactor.toFixed(3)]),
    row(["Expectancy R", o.r?.expectancyR == null ? "" : o.r.expectancyR.toFixed(3)]),
    row(["Sharpe", o.riskRatios?.sharpe == null ? "" : o.riskRatios.sharpe.toFixed(3)]),
    row(["Sortino", o.riskRatios?.sortino == null ? "" : o.riskRatios.sortino.toFixed(3)]),
    row(["Calmar", o.riskRatios?.calmar == null ? "" : o.riskRatios.calmar.toFixed(3)]),
    row(["Kelly %", o.significance?.kelly == null ? "" : (o.significance.kelly * 100).toFixed(2)]),
  ]

  lines.push(...bucketSection("By strategy", data.byStrategy))
  lines.push(...bucketSection("By signal", data.bySignal))
  lines.push(...bucketSection("By instrument", data.byInstrument))
  lines.push(...bucketSection("By session", data.bySession))
  lines.push(...bucketSection("By weekday", data.byWeekday))
  lines.push(...bucketSection("By hour", data.byHour))

  return lines.join("\r\n")
}

/** Trigger a browser download of the generated CSV. */
export function downloadAnalyticsCsv(data: AnalyticsResult, filename = "analytics.csv") {
  const csv = buildAnalyticsCsv(data)
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
