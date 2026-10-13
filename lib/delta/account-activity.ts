export type DeltaActivityPosition = {
  accountId?: string
  accountLabel?: string
  symbol: string
  side: "long" | "short" | "flat"
  size: number
  entryPrice?: number
  markPrice?: number
  unrealizedPnl?: number
}

export type DeltaActivityOrder = {
  id: string
  accountId?: string
  accountLabel?: string
  symbol: string
  side: "buy" | "sell"
  size: number
  price?: number
  source?: "manual" | "auto"
  createdAt?: string
}

export type DeltaAccountActivityRow = {
  accountId: string
  label: string
  enabled: boolean
  hasOpenPosition: boolean
  openPositionCount: number
  unrealizedPnl: number
  recentOrderCount: number
  lastOrderAt?: string
  positions: DeltaActivityPosition[]
  recentOrders: DeltaActivityOrder[]
  error?: string
}

export function buildAccountActivity(input: {
  accounts: Array<{ id: string; label: string; enabled: boolean }>
  positions: DeltaActivityPosition[]
  orders: DeltaActivityOrder[]
  errors?: Record<string, string>
}): DeltaAccountActivityRow[] {
  const ordersByAccount = new Map<string, DeltaActivityOrder[]>()
  for (const order of input.orders) {
    const id = order.accountId ?? "unknown"
    const list = ordersByAccount.get(id) ?? []
    list.push(order)
    ordersByAccount.set(id, list)
  }

  return input.accounts.map((account) => {
    const positions = input.positions.filter((p) => p.accountId === account.id)
    const recentOrders = ordersByAccount.get(account.id) ?? []
    const unrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealizedPnl ?? 0), 0)

    const sortedOrders = [...recentOrders].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
      return tb - ta
    })

    return {
      accountId: account.id,
      label: account.label,
      enabled: account.enabled,
      hasOpenPosition: positions.length > 0,
      openPositionCount: positions.length,
      unrealizedPnl,
      recentOrderCount: sortedOrders.length,
      lastOrderAt: sortedOrders[0]?.createdAt,
      positions,
      recentOrders: sortedOrders,
      error: input.errors?.[account.id],
    }
  })
}

export function sortAccountsByActivity(rows: DeltaAccountActivityRow[]): DeltaAccountActivityRow[] {
  return [...rows].sort((a, b) => {
    if (a.hasOpenPosition !== b.hasOpenPosition) return a.hasOpenPosition ? -1 : 1
    const pnlDiff = Math.abs(b.unrealizedPnl) - Math.abs(a.unrealizedPnl)
    if (pnlDiff !== 0) return pnlDiff
    return a.label.localeCompare(b.label)
  })
}
