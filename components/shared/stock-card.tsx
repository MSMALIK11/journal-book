// StockIndexCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface StockIndexCardProps {
  name: string
  last: number
  high: number
  low: number
  change: number
  pChange: number
}

export default function StockIndexCard({ name, last, high, low, change, pChange }: StockIndexCardProps) {
  const isPositive = change > 0

  return (
    <Card className="w-full max-w-sm rounded-2xl shadow-md">
      <CardHeader className="">
        <CardTitle className="text-xl font-semibold">{name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="text-2xl font-bold">₹{last.toFixed(2)}</div>
        <div className={cn("flex items-center gap-1 text-sm font-medium", isPositive ? "text-green-600" : "text-red-600")}> 
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {change.toFixed(2)} ({pChange.toFixed(2)}%)
        </div>
        <div className="text-xs text-muted-foreground">H: ₹{high.toFixed(2)} / L: ₹{low.toFixed(2)}</div>
      </CardContent>
    </Card>
  )
}
