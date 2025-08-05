"use client"

import { useState, useEffect } from "react"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line
} from "recharts"
import { TrendingUp, TrendingDown, Target, AlertTriangle } from "lucide-react"

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8"]

// 🧪 Mock Trade Data
const mockTrades = [
  { user_id: "123", net_pnl: 500, strategy: "Breakout", emotion_tag: "Confident", entry_date: "2025-08-01" },
  { user_id: "123", net_pnl: -300, strategy: "Reversal", emotion_tag: "Greedy", entry_date: "2025-08-01" },
  { user_id: "123", net_pnl: 700, strategy: "Breakout", emotion_tag: "Confident", entry_date: "2025-08-02" },
  { user_id: "123", net_pnl: -100, strategy: "Scalping", emotion_tag: "Fearful", entry_date: "2025-08-02" },
  { user_id: "123", net_pnl: 0, strategy: "Reversal", emotion_tag: "Calm", entry_date: "2025-08-03" },
  { user_id: "123", net_pnl: 400, strategy: "Breakout", emotion_tag: "Confident", entry_date: "2025-08-03" },
  { user_id: "123", net_pnl: -200, strategy: "Scalping", emotion_tag: "Greedy", entry_date: "2025-08-04" },
]

export function AnalyticsDashboard() {
  const [analytics, setAnalytics] = useState<any>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    calculateAnalytics(mockTrades)
    setLoading(false)
  }, [])

  const calculateAnalytics = (tradesData: any[]) => {
    const completedTrades = tradesData.filter((trade) => trade.net_pnl !== null)
    const profitableTrades = completedTrades.filter((trade) => trade.net_pnl > 0)
    const losingTrades = completedTrades.filter((trade) => trade.net_pnl < 0)

    const totalPnL = completedTrades.reduce((sum, trade) => sum + trade.net_pnl, 0)
    const totalProfit = profitableTrades.reduce((sum, trade) => sum + trade.net_pnl, 0)
    const totalLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.net_pnl, 0))

    const winRate = completedTrades.length > 0 ? (profitableTrades.length / completedTrades.length) * 100 : 0
    const avgRR = totalLoss > 0 ? totalProfit / totalLoss : 0

    const strategyStats = completedTrades.reduce((acc, trade) => {
      const strategy = trade.strategy || "Unknown"
      if (!acc[strategy]) acc[strategy] = { count: 0, pnl: 0 }
      acc[strategy].count++
      acc[strategy].pnl += trade.net_pnl
      return acc
    }, {})

    const strategyData = Object.entries(strategyStats).map(([name, stats]: [string, any]) => ({
      name, count: stats.count, pnl: stats.pnl,
    }))

    const emotionStats = completedTrades.reduce((acc, trade) => {
      const emotion = trade.emotion_tag || "Unknown"
      if (!acc[emotion]) acc[emotion] = { count: 0, pnl: 0 }
      acc[emotion].count++
      acc[emotion].pnl += trade.net_pnl
      return acc
    }, {})

    const emotionData = Object.entries(emotionStats).map(([name, stats]: [string, any]) => ({
      name, count: stats.count, pnl: stats.pnl,
    }))

    const dailyPnL = completedTrades.reduce((acc, trade) => {
      const date = trade.entry_date
      if (!acc[date]) acc[date] = 0
      acc[date] += trade.net_pnl
      return acc
    }, {})

    const dailyData = Object.entries(dailyPnL)
      .map(([date, pnl]: [string, any]) => ({ date, pnl }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    const bestDay = Math.max(...(Object.values(dailyPnL) as number[]))
    const worstDay = Math.min(...(Object.values(dailyPnL) as number[]))

    let maxDrawdown = 0
    let peak = 0
    let runningPnL = 0

    dailyData.forEach((day) => {
      runningPnL += day.pnl
      if (runningPnL > peak) peak = runningPnL
      const drawdown = peak - runningPnL
      if (drawdown > maxDrawdown) maxDrawdown = drawdown
    })

    setAnalytics({
      totalTrades: completedTrades.length,
      winRate,
      avgRR,
      totalPnL,
      totalProfit,
      totalLoss,
      bestDay,
      worstDay,
      maxDrawdown,
      strategyData,
      emotionData,
      dailyData,
      mostProfitableStrategy: strategyData.reduce((best, current) => (current.pnl > best.pnl ? current : best), {
        name: "None", pnl: 0,
      }),
    })
  }

  if (loading) return <div className="flex justify-center p-8">Loading analytics...</div>

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.winRate?.toFixed(1)}%</div>
            <Progress value={analytics.winRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
            {analytics.totalPnL >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${analytics.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
              ₹{analytics.totalPnL?.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">{analytics.totalTrades} completed trades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg R:R Ratio</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.avgRR?.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Risk to Reward</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Max Drawdown</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">₹{analytics.maxDrawdown?.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Maximum loss from peak</p>
          </CardContent>
        </Card>
      </div>

      {/* Performance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Best & Worst Days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Best Trading Day</span>
              <Badge className="bg-green-100 text-green-800">₹{analytics.bestDay?.toFixed(2)}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Worst Trading Day</span>
              <Badge variant="destructive">₹{analytics.worstDay?.toFixed(2)}</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Most Profitable Strategy</span>
              <Badge variant="outline">{analytics.mostProfitableStrategy?.name}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Profit vs Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Profit</span>
                <span className="text-green-600 font-bold">₹{analytics.totalProfit?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total Loss</span>
                <span className="text-red-600 font-bold">₹{analytics.totalLoss?.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Net P&L</span>
                  <span className={`font-bold ${analytics.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                    ₹{analytics.totalPnL?.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Strategy Performance</CardTitle>
            <CardDescription>P&L by trading strategy</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analytics.strategyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => [`₹${value}`, "P&L"]} />
                <Bar dataKey="pnl" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Emotion Analysis</CardTitle>
            <CardDescription>Trade count by emotion</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analytics.emotionData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  dataKey="count"
                >
                  {analytics.emotionData?.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Daily P&L Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily P&L Trend</CardTitle>
          <CardDescription>Your trading performance over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={analytics.dailyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => [`₹${value}`, "P&L"]} />
              <Line type="monotone" dataKey="pnl" stroke="#8884d8" strokeWidth={2} dot={{ fill: "#8884d8" }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
