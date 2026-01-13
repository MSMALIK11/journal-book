// "use client"

// import { useState, useEffect } from "react"
// import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
// import { Button } from "@/components/ui/button"
// import { Badge } from "@/components/ui/badge"
// import { TrendingUp, TrendingDown, PlusCircle, BarChart3, Calendar, Target, Info } from "lucide-react"
// import Link from "next/link"
// import { ThemeToggle } from "@/components/theme-toggle"
// import { MarketTicker } from "@/components/IndexTicker"
// import api from '@/services'
// export default function DashboardPage() {
//   const [stats, setStats] = useState<any>({})
//   const [loading, setLoading] = useState(false)

//   useEffect(() => {
//     // Check if MongoDB is configured
//     const getUser = async () => {
//       setLoading(true)
//       try {
//       const res=await api.getUser()
//       console.log('res',res)
//       if(res.data.status !== 200) {
//           throw new Error("MongoDB is not configured")
//         }
//       } catch (error) {
//         console.error("Error fetching user:", error)
//       } finally {
//         setLoading(false)
//       }
//     }

//     getUser()
//     fetchDashboardData()
//   }, [])

// const fetchDashboardData=async()=>{
//   try {
//     const res=await api.dashboard.getDashboardData()
//     console.log('res dashboard',res)
//     setStats(res)
    
//   } catch (error) {
    
//   }
// }

//   if (loading) {
//     return (
//       <div className="flex">
//         {/* <Sidebar /> */}
//         <div className="flex-1 lg:ml-64 p-8">
//           <div className="flex justify-center">Loading...</div>
//         </div>
//       </div>
//     )
//   }
//   const formatDate = (date: string | Date) => {
//   const d = new Date(date);
//   return d.toLocaleDateString("en-GB", {
//     day: "2-digit",
//     month: "2-digit",
//     year: "2-digit",
//   });
// };

//   return (
//     <div className="">
//       {/* <Sidebar /> */}
//            <MarketTicker/>
//       <div className="flex-1 p-4 lg:p-8">
//         <div className="space-y-6">
        

//           <div className="flex justify-between">
//             <div>
//             <h1 className="text-3xl font-bold">Trading Dashboard</h1>
//             <p className="text-muted-foreground">Welcome back! Here's your trading overview.</p>

//             </div>
//             <div>
//               <ThemeToggle />
//             </div>
//           </div>
//           {/* Quick Stats */}
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
//             <Card>
//               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//                 <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
//                 <BarChart3 className="h-4 w-4 text-muted-foreground" />
//               </CardHeader>
//               <CardContent>
//                 <div className="text-2xl font-bold">{stats?.totalTrades}</div>
//                 <p className="text-xs text-muted-foreground">{stats?.completedTrades} completed</p>
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//                 <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
//                 <Target className="h-4 w-4 text-muted-foreground" />
//               </CardHeader>
//               <CardContent>
//                 <div className="text-2xl font-bold">{stats?.winRate}%</div>
//                 <p className="text-xs text-muted-foreground">Success rate</p>
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//                 <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
//                 {stats?.totalPnL >= 0 ? (
//                   <TrendingUp className="h-4 w-4 text-green-600" />
//                 ) : (
//                   <TrendingDown className="h-4 w-4 text-red-600" />
//                 )}
//               </CardHeader>
//               <CardContent>
//                 <div className={`text-2xl font-bold ${stats?.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
//                   ${stats?.totalPnL}
//                 </div>
//                 <p className="text-xs text-muted-foreground">Net profit/loss</p>
//               </CardContent>
//             </Card>

//             <Card>
//               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
//                 <CardTitle className="text-sm font-medium">Today's Trades</CardTitle>
//                 <Calendar className="h-4 w-4 text-muted-foreground" />
//               </CardHeader>
//               <CardContent>
//                 <div className="text-2xl font-bold">{stats?.todaysTrades}</div>
//                 <p className="text-xs text-muted-foreground">Trades today</p>
//               </CardContent>
//             </Card>
//           </div>

//           {/* Quick Actions */}
//           <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//             <Link href="/trades/new">
//               <Card className="cursor-pointer hover:shadow-md transition-shadow">
//                 <CardHeader>
//                   <CardTitle className="flex items-center gap-2">
//                     <PlusCircle className="h-5 w-5" />
//                     Add New Trade
//                   </CardTitle>
//                   <CardDescription>Log your latest trade with all details</CardDescription>
//                 </CardHeader>
//               </Card>
//             </Link>

//             <Link href="/analytics">
//               <Card className="cursor-pointer hover:shadow-md transition-shadow">
//                 <CardHeader>
//                   <CardTitle className="flex items-center gap-2">
//                     <BarChart3 className="h-5 w-5" />
//                     View Analytics
//                   </CardTitle>
//                   <CardDescription>Analyze your trading performance</CardDescription>
//                 </CardHeader>
//               </Card>
//             </Link>

//             <Link href="/calendar">
//               <Card className="cursor-pointer hover:shadow-md transition-shadow">
//                 <CardHeader>
//                   <CardTitle className="flex items-center gap-2">
//                     <Calendar className="h-5 w-5" />
//                     Trading Calendar
//                   </CardTitle>
//                   <CardDescription>View trades by date</CardDescription>
//                 </CardHeader>
//               </Card>
//             </Link>
//           </div>

//           {/* Recent Trades */}
//           <Card>
//             <CardHeader>
//               <div className="flex items-center justify-between">
//                 <CardTitle>Recent Trades</CardTitle>
//                 <Link href="/trades">
//                   <Button variant="outline" size="sm">
//                     View All
//                   </Button>
//                 </Link>
//               </div>
//             </CardHeader>
//             <CardContent>
//               {stats?.recentTrades?.length > 0 ? (
//                 <div className="space-y-4">
//                   {stats?.recentTrades?.map((trade) => (
//                     <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg">
//                       <div className="flex items-center gap-4">
//                         <div>
//                           <div className="font-medium">{trade.instrument}</div>
//                           <div className="text-sm text-muted-foreground">
//                            {formatDate(trade.entry_date)} Open • {trade?.entry_price}  Closed  {trade?.exit_price}
//                           </div>
//                         </div>
//                         <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>{trade.trade_type}</Badge>
//                       </div>
//                       <div className="text-right">
                      
//                         {trade.quantity}  Lot
//                       </div>
//                     </div>
//                   ))}
//                 </div>
//               ) : (
//                 <div className="text-center py-8 text-muted-foreground">
//                   No trades yet.{" "}
//                   <Link href="/trades/new" className="text-primary hover:underline">
//                     Add your first trade
//                   </Link>
//                 </div>
//               )}
//             </CardContent>
//           </Card>
//         </div>
//       </div>
//     </div>
//   )
// }


"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, PlusCircle, BarChart3, Calendar, Target } from "lucide-react"
import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { MarketTicker } from "@/components/IndexTicker"
import api from '@/services'
import { Skeleton } from "@/components/ui/skeleton"

export default function DashboardPage() {
  const [stats, setStats] = useState<any>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const getUser = async () => {
      setLoading(true)
      try {
        const res = await api.getUser()
        if (res.data.status !== 200) throw new Error("MongoDB is not configured")
      } catch (error) {
        console.error("Error fetching user:", error)
      } finally {
        setLoading(false)
      }
    }

    getUser()
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      const res = await api.dashboard.getDashboardData()
      setStats(res)
    } catch (error) {
      console.error(error)
    }
  }

  const formatDate = (date: string | Date) => {
    const d = new Date(date)
    return d.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    })
  }

  return (
    <div>
      <MarketTicker />
      <div className="flex-1 p-4 lg:p-8">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex justify-between">
            <div>
              <h1 className="text-3xl font-bold">Trading Dashboard</h1>
              <p className="text-muted-foreground">Welcome back! Here's your trading overview.</p>
            </div>
            <ThemeToggle />
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {loading ? (
              Array(4).fill(0).map((_, i) => (
                <Card key={i} className="p-4">
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-3 w-16 mt-2" />
                </Card>
              ))
            ) : (
              <>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total Trades</CardTitle>
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.totalTrades}</div>
                    <p className="text-xs text-muted-foreground">{stats?.completedTrades} completed</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                    <Target className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.winRate}%</div>
                    <p className="text-xs text-muted-foreground">Success rate</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Total P&L</CardTitle>
                    {stats?.totalPnL >= 0 ? (
                      <TrendingUp className="h-4 w-4 text-green-600" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-red-600" />
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${stats?.totalPnL >= 0 ? "text-green-600" : "text-red-600"}`}>
                      ${stats?.totalPnL}
                    </div>
                    <p className="text-xs text-muted-foreground">Net profit/loss</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Today's Trades</CardTitle>
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stats?.todaysTrades}</div>
                    <p className="text-xs text-muted-foreground">Trades today</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <Card key={i} className="p-6">
                  <Skeleton className="h-6 w-32 mb-2" />
                  <Skeleton className="h-4 w-48" />
                </Card>
              ))
            ) : (
              <>
                <Link href="/trades/new">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <PlusCircle className="h-5 w-5" />
                        Add New Trade
                      </CardTitle>
                      <CardDescription>Log your latest trade with all details</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>

                <Link href="/analytics">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        View Analytics
                      </CardTitle>
                      <CardDescription>Analyze your trading performance</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>

                <Link href="/calendar">
                  <Card className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Trading Calendar
                      </CardTitle>
                      <CardDescription>View trades by date</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </>
            )}
          </div>

          {/* Recent Trades */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Recent Trades</CardTitle>
                <Link href="/trades">
                  <Button variant="outline" size="sm">
                    View All
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">
                  {Array(3).fill(0).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-10 w-24" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              ) : stats?.recentTrades?.length > 0 ? (
                <div className="space-y-4">
                  {stats?.recentTrades?.map((trade: any) => (
                    <div key={trade.id} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="font-medium">{trade.instrument}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatDate(trade.entry_date)} Open • {trade?.entry_price} Closed {trade?.exit_price}
                          </div>
                        </div>
                        <Badge variant={trade.trade_type === "Buy" ? "default" : "secondary"}>
                          {trade.trade_type}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">₹{trade.entry_price}</div>
                        {trade.quantity} Lot
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No trades yet.{" "}
                  <Link href="/trades/new" className="text-primary hover:underline">
                    Add your first trade
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
