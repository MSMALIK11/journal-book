import Trade, { type ITrade } from "@/app/api/models/Trade"
import connectDB from "@/app/api/db/mongoose"

export class TradeAPI {
  static async getTrades(
    userId: string,
    filters?: {
      search?: string
      type?: "profit" | "loss" | "all"
      strategy?: string
      page?: number
      limit?: number
    },
  ) {
    await connectDB()

    const query: any = { userId }
    const { search, type, strategy, page = 1, limit = 10 } = filters || {}

    if (search) {
      query.$or = [{ instrument: { $regex: search, $options: "i" } }, { strategy: { $regex: search, $options: "i" } }]
    }

    if (type === "profit") {
      query.net_pnl = { $gt: 0 }
    } else if (type === "loss") {
      query.net_pnl = { $lt: 0 }
    }

    if (strategy && strategy !== "all") {
      query.strategy = strategy
    }

    const trades = await Trade.find(query)
      .sort({ entry_date: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean()

    const total = await Trade.countDocuments(query)

    return {
      trades: trades.map((trade) => ({
        ...trade,
        id: trade._id.toString(),
        entry_date: trade.entry_date.toISOString().split("T")[0],
        exit_date: trade.exit_date ? trade.exit_date.toISOString().split("T")[0] : null,
      })),
      total,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async createTrade(tradeData: Omit<ITrade, "_id" | "createdAt" | "updatedAt">) {
    await connectDB()
    const trade = await Trade.create(tradeData)
    return {
      ...trade.toObject(),
      id: trade._id.toString(),
    }
  }

  static async updateTrade(tradeId: string, userId: string, updates: Partial<ITrade>) {
    await connectDB()
    const trade = await Trade.findOneAndUpdate(
      { _id: tradeId, userId },
      { ...updates, updatedAt: new Date() },
      { new: true },
    )
    return trade
      ? {
          ...trade.toObject(),
          id: trade._id.toString(),
        }
      : null
  }

  static async deleteTrade(tradeId: string, userId: string) {
    await connectDB()
    const result = await Trade.findOneAndDelete({ _id: tradeId, userId })
    return !!result
  }

  static async getTradeStats(userId: string) {
    await connectDB()

    const trades = await Trade.find({ userId, net_pnl: { $ne: null } }).lean()

    if (trades.length === 0) {
      return {
        totalTrades: 0,
        completedTrades: 0,
        winRate: 0,
        totalPnL: 0,
        todayTrades: 0,
      }
    }

    const profitableTrades = trades.filter((trade) => trade.net_pnl! > 0)
    const totalPnL = trades.reduce((sum, trade) => sum + (trade.net_pnl || 0), 0)
    const winRate = (profitableTrades.length / trades.length) * 100

    const today = new Date().toISOString().split("T")[0]
    const todayTrades = await Trade.countDocuments({
      userId,
      entry_date: {
        $gte: new Date(today),
        $lt: new Date(new Date(today).getTime() + 24 * 60 * 60 * 1000),
      },
    })

    return {
      totalTrades: trades.length,
      completedTrades: trades.length,
      winRate,
      totalPnL,
      todayTrades,
    }
  }
}
