import { format } from "date-fns"
import Trade from "@/app/api/models/Trade"

export type TradeListSummary = {
  total: number
  wins: number
  losses: number
  winRate: number
  todayPnl: number
  totalPnl: number
  bestTrade: number
  worstTrade: number
  lastTradeAt: string | null
  dayCounts: number[]
  exportMonths: Array<{ monthKey: string; count: number }>
}

export async function buildTradeListSummary(
  query: Record<string, unknown>,
): Promise<TradeListSummary> {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const weekAgo = new Date(startOfToday)
  weekAgo.setDate(weekAgo.getDate() - 6)

  const [facet] = await Trade.aggregate([
    { $match: query },
    {
      $facet: {
        overall: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              closed: {
                $sum: {
                  $cond: [{ $and: [{ $ne: ["$exit_date", null] }, { $ne: [{ $type: "$exit_date" }, "missing"] }] }, 1, 0],
                },
              },
              wins: { $sum: { $cond: [{ $gt: ["$net_pnl", 0] }, 1, 0] } },
              losses: { $sum: { $cond: [{ $lt: ["$net_pnl", 0] }, 1, 0] } },
              totalPnl: {
                $sum: {
                  $cond: [
                    { $and: [{ $ne: ["$exit_date", null] }, { $ne: [{ $type: "$exit_date" }, "missing"] }] },
                    { $ifNull: ["$net_pnl", 0] },
                    0,
                  ],
                },
              },
              bestTrade: { $max: { $cond: [{ $gt: ["$net_pnl", 0] }, "$net_pnl", null] } },
              worstTrade: { $min: { $cond: [{ $lt: ["$net_pnl", 0] }, "$net_pnl", null] } },
            },
          },
        ],
        today: [
          { $match: { entry_date: { $gte: startOfToday } } },
          { $group: { _id: null, todayPnl: { $sum: { $ifNull: ["$net_pnl", 0] } } } },
        ],
        last: [{ $sort: { entry_date: -1 } }, { $limit: 1 }, { $project: { entry_date: 1 } }],
        days: [
          { $match: { entry_date: { $gte: weekAgo } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$entry_date" } },
              count: { $sum: 1 },
            },
          },
        ],
        months: [
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$entry_date" } },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
        ],
      },
    },
  ])

  const overall = facet?.overall?.[0] ?? {}
  const closed = Number(overall.closed || 0)
  const wins = Number(overall.wins || 0)
  const dayMap = new Map<string, number>(
    (facet?.days ?? []).map((row: { _id: string; count: number }) => [row._id, row.count]),
  )
  const dayCounts: number[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = new Date(startOfToday)
    day.setDate(day.getDate() - offset)
    dayCounts.push(dayMap.get(format(day, "yyyy-MM-dd")) || 0)
  }

  const lastTradeAt = facet?.last?.[0]?.entry_date
    ? new Date(facet.last[0].entry_date).toISOString()
    : null

  return {
    total: Number(overall.total || 0),
    wins,
    losses: Number(overall.losses || 0),
    winRate: closed ? (wins / closed) * 100 : 0,
    todayPnl: Number(facet?.today?.[0]?.todayPnl || 0),
    totalPnl: Number(overall.totalPnl || 0),
    bestTrade: Number(overall.bestTrade || 0),
    worstTrade: Number(overall.worstTrade || 0),
    lastTradeAt,
    dayCounts,
    exportMonths: (facet?.months ?? []).map((row: { _id: string; count: number }) => ({
      monthKey: row._id,
      count: row.count,
    })),
  }
}
