import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Eye,
  Filter,
  LineChart,
  PieChart,
  Target,
  TrendingUp,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"


export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d1117] text-[#f0f6fc]">
      {/* Navigation */}
      <nav className="border-b border-[#30363d] bg-[#161b22]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">MarketMitra</span>
          </div>
          <div className="hidden md:flex items-center space-x-6">
            <Link href="#features" className="text-[#7d8590] hover:text-[#f0f6fc] transition-colors">
              Features
            </Link>
            <Link href="#pricing" className="text-[#7d8590] hover:text-[#f0f6fc] transition-colors">
              Pricing
            </Link>
            <Link href="#about" className="text-[#7d8590] hover:text-[#f0f6fc] transition-colors">
              About
            </Link>
            <Button className="bg-[#238636] hover:bg-[#2ea043] text-white">
                <Link href={"/dashboard"} className="flex items-center">
                Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <Badge className="mb-6 bg-[#1f6feb]/20 text-[#58a6ff] border-[#1f6feb]/30">
            Your Complete Trading Companion
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-[#f0f6fc] via-[#58a6ff] to-[#f0f6fc] bg-clip-text text-transparent">
            Master Your Trading Journey with MarketMitra
          </h1>
          <p className="text-xl text-[#7d8590] mb-8 leading-relaxed">
            The ultimate trading journal, strategy tracker, and portfolio manager. Log trades, analyze strategies, track
            stocks, and gain insights that transform your trading performance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-[#238636] hover:bg-[#2ea043] text-white px-8">
              Start Trading Smarter
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[#30363d] text-[#f0f6fc] hover:bg-[#21262d] bg-transparent"
            >
              View Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Features Overview */}
      <section id="features" className="py-20 px-4 bg-[#161b22]">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4">Everything You Need to Excel</h2>
            <p className="text-[#7d8590] text-lg max-w-2xl mx-auto">
              Four powerful modules working together to give you complete control over your trading journey
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="bg-[#21262d] border-[#30363d] hover:border-[#58a6ff]/50 transition-all duration-300 group">
              <CardHeader>
                <div className="w-12 h-12 bg-[#1f6feb]/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#1f6feb]/30 transition-colors">
                  <BookOpen className="w-6 h-6 text-[#58a6ff]" />
                </div>
                <CardTitle className="text-[#f0f6fc]">Trade Journal</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Comprehensive trade logging with emotions, screenshots, and detailed analysis
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[#21262d] border-[#30363d] hover:border-[#238636]/50 transition-all duration-300 group">
              <CardHeader>
                <div className="w-12 h-12 bg-[#238636]/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#238636]/30 transition-colors">
                  <Target className="w-6 h-6 text-[#2ea043]" />
                </div>
                <CardTitle className="text-[#f0f6fc]">Strategy Tracker</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Create, manage, and analyze your trading strategies with detailed performance metrics
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[#21262d] border-[#30363d] hover:border-[#f85149]/50 transition-all duration-300 group">
              <CardHeader>
                <div className="w-12 h-12 bg-[#da3633]/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#da3633]/30 transition-colors">
                  <Eye className="w-6 h-6 text-[#f85149]" />
                </div>
                <CardTitle className="text-[#f0f6fc]">Stock Tracker</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Organize your watchlist by sectors, add notes, and track your investment interests
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[#21262d] border-[#30363d] hover:border-[#a5a5a5]/50 transition-all duration-300 group">
              <CardHeader>
                <div className="w-12 h-12 bg-[#6e7681]/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-[#6e7681]/30 transition-colors">
                  <Brain className="w-6 h-6 text-[#a5a5a5]" />
                </div>
                <CardTitle className="text-[#f0f6fc]">Insights & Analytics</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Advanced filtering and analytics to identify patterns and improve performance
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Detailed Features */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
            <div>
              <Badge className="mb-4 bg-[#1f6feb]/20 text-[#58a6ff] border-[#1f6feb]/30">Trade Journal</Badge>
              <h3 className="text-3xl font-bold mb-6">Log Every Detail That Matters</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#58a6ff] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Complete Trade Records</p>
                    <p className="text-[#7d8590]">
                      Date, ticker, direction, size, strategy, emotions, results, and screenshots
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#58a6ff] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Custom Tags & Categories</p>
                    <p className="text-[#7d8590]">
                      Organize with tags like "Reversal", "Scalping", "FOMO" for better analysis
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#58a6ff] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Auto PnL Calculation</p>
                    <p className="text-[#7d8590]">Automatic profit and loss calculations with detailed breakdowns</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#58a6ff] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Entry/Exit Reasoning</p>
                    <p className="text-[#7d8590]">Track why you entered and exited trades for better decision making</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[#161b22] rounded-lg p-6 border border-[#30363d]">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#7d8590]">Recent Trades</span>
                  <Badge className="bg-[#238636]/20 text-[#2ea043] border-[#238636]/30">+12.5%</Badge>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                    <div>
                      <p className="font-semibold text-[#f0f6fc]">AAPL</p>
                      <p className="text-sm text-[#7d8590]">Long • Breakout Strategy</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#2ea043] font-semibold">+$245</p>
                      <p className="text-sm text-[#7d8590]">2.3% gain</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                    <div>
                      <p className="font-semibold text-[#f0f6fc]">TSLA</p>
                      <p className="text-sm text-[#7d8590]">Short • Reversal Strategy</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#f85149] font-semibold">-$89</p>
                      <p className="text-sm text-[#7d8590]">-1.2% loss</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center mb-20">
            <div className="order-2 lg:order-1">
              <div className="bg-[#161b22] rounded-lg p-6 border border-[#30363d]">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-[#7d8590]">Strategy Performance</span>
                    <Filter className="w-4 h-4 text-[#7d8590]" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                      <div>
                        <p className="font-semibold text-[#f0f6fc]">Breakout Strategy</p>
                        <p className="text-sm text-[#7d8590]">23 trades • 65% win rate</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#2ea043] font-semibold">2.1 RR</p>
                        <p className="text-sm text-[#7d8590]">Profit Factor</p>
                      </div>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                      <div>
                        <p className="font-semibold text-[#f0f6fc]">Scalping Strategy</p>
                        <p className="text-sm text-[#7d8590]">45 trades • 58% win rate</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#2ea043] font-semibold">1.8 RR</p>
                        <p className="text-sm text-[#7d8590]">Profit Factor</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <Badge className="mb-4 bg-[#238636]/20 text-[#2ea043] border-[#238636]/30">Strategy Tracker</Badge>
              <h3 className="text-3xl font-bold mb-6">Perfect Your Trading Strategies</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#2ea043] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Strategy Management</p>
                    <p className="text-[#7d8590]">
                      Add, update, and delete trading strategies with detailed parameters
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#2ea043] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Historical Analysis</p>
                    <p className="text-[#7d8590]">View all past trades filtered by specific strategies</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#2ea043] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Performance Metrics</p>
                    <p className="text-[#7d8590]">
                      Win rate, profit factor, and average risk-reward ratio per strategy
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#2ea043] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Strategy Comparison</p>
                    <p className="text-[#7d8590]">
                      Compare different strategies to identify your most profitable approaches
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <Badge className="mb-4 bg-[#da3633]/20 text-[#f85149] border-[#da3633]/30">
                Stock Tracker & Insights
              </Badge>
              <h3 className="text-3xl font-bold mb-6">Smart Watchlist & Deep Analytics</h3>
              <div className="space-y-4">
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#f85149] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Organized Watchlist</p>
                    <p className="text-[#7d8590]">
                      Group stocks by sector, category, and interest level with custom notes
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#f85149] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Advanced Filtering</p>
                    <p className="text-[#7d8590]">Filter by sector, performance, tags, and custom criteria</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#f85149] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Pattern Recognition</p>
                    <p className="text-[#7d8590]">Identify your most common losing emotions and profitable patterns</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <div className="w-2 h-2 bg-[#f85149] rounded-full mt-2"></div>
                  <div>
                    <p className="font-semibold text-[#f0f6fc]">Comprehensive Reports</p>
                    <p className="text-[#7d8590]">
                      Trade count by strategy, average RR, winning rates, and emotion statistics
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-[#161b22] rounded-lg p-6 border border-[#30363d]">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#7d8590]">Watchlist</span>
                  <Badge className="bg-[#da3633]/20 text-[#f85149] border-[#da3633]/30">Tech Sector</Badge>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                    <div>
                      <p className="font-semibold text-[#f0f6fc]">NVDA</p>
                      <p className="text-sm text-[#7d8590]">AI Play • Breakout Setup</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#2ea043] font-semibold">$485.20</p>
                      <p className="text-sm text-[#7d8590]">+2.4%</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-[#21262d] rounded border border-[#30363d]">
                    <div>
                      <p className="font-semibold text-[#f0f6fc]">MSFT</p>
                      <p className="text-sm text-[#7d8590]">Long Term • Earnings Play</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[#f85149] font-semibold">$412.85</p>
                      <p className="text-sm text-[#7d8590]">-0.8%</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section className="py-20 px-4 bg-[#161b22]">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Your Trading Command Center</h2>
          <p className="text-[#7d8590] text-lg mb-12 max-w-2xl mx-auto">
            Get a complete overview of your trading performance with our comprehensive dashboard
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <Card className="bg-[#21262d] border-[#30363d]">
              <CardHeader className="text-center">
                <BarChart3 className="w-8 h-8 text-[#58a6ff] mx-auto mb-2" />
                <CardTitle className="text-[#f0f6fc]">Recent Trades</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Quick access to your latest trading activity
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[#21262d] border-[#30363d]">
              <CardHeader className="text-center">
                <LineChart className="w-8 h-8 text-[#2ea043] mx-auto mb-2" />
                <CardTitle className="text-[#f0f6fc]">Strategy Win Rates</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Performance metrics for all your strategies
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="bg-[#21262d] border-[#30363d]">
              <CardHeader className="text-center">
                <PieChart className="w-8 h-8 text-[#f85149] mx-auto mb-2" />
                <CardTitle className="text-[#f0f6fc]">Upcoming Earnings</CardTitle>
                <CardDescription className="text-[#7d8590]">
                  Stay ahead with earnings calendar integration
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">Ready to Transform Your Trading?</h2>
          <p className="text-[#7d8590] text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of traders who have improved their performance with MarketMitra. Start your journey to
            consistent profitability today.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-[#238636] hover:bg-[#2ea043] text-white px-8">
              Start Free Trial
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[#30363d] text-[#f0f6fc] hover:bg-[#21262d] bg-transparent"
            >
              Schedule Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#30363d] bg-[#161b22] py-12 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold">MarketMitra</span>
              </div>
              <p className="text-[#7d8590]">
                Your complete trading companion for journaling, strategy tracking, and portfolio management.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-[#f0f6fc]">Product</h4>
              <ul className="space-y-2 text-[#7d8590]">
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Demo
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-[#f0f6fc]">Support</h4>
              <ul className="space-y-2 text-[#7d8590]">
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Documentation
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Help Center
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4 text-[#f0f6fc]">Company</h4>
              <ul className="space-y-2 text-[#7d8590]">
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="#" className="hover:text-[#f0f6fc] transition-colors">
                    Privacy
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#30363d] mt-8 pt-8 text-center text-[#7d8590]">
            <p>&copy; 2024 MarketMitra. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
