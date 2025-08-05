"use client"
import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import StockIndexCard from "../shared/stock-card"

interface NiftyData {
  name: string
  last: number
  high: number
  low: number
  change: number
  pChange: number
}

export default function IndianIndex() {
  const [data, setData] = useState<NiftyData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchNifty = async () => {
      try {
        const res = await fetch("/api/nse")
        const json = await res.json()
        console.log("Nifty data:", json)
        setData(json)
      } catch (err) {
        console.error("Failed to fetch Nifty", err)
      } finally {
        setLoading(false)
      }
    }

    fetchNifty()
  }, [])

  return (
    <div className="w-full max-w-sm mt-4">
        {loading ? (
          <p>Loading...</p>
        ) : data ? (
          <div className="space-y-2 text-sm">
            <p>Last: {data.last?.toFixed(2)}</p>
            <p>High: {data.high?.toFixed(2)}</p>
            <p>Low: {data.low?.toFixed(2)}</p>
            <p>
              Change: {data.change?.toFixed(2)} ({data.pChange?.toFixed(2)}%)
            </p>
            <StockIndexCard name="Nifty 50" pChange={Number(data.pChange)} last={Number(data.last)}  change={Number(data.change)} high={Number(data.high)} low={Number(data?.low)}  />
          </div>
        ) : (
          <p>Failed to load data.</p>
        )}
  
    </div>
  )
}
