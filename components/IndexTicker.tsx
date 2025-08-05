

"use client"

import React, { useMemo, useState } from "react"
import useSWR from "swr"
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"


const fetcher = (url: string) => fetch(url).then((res) => res.json())

const assets = [
  { name: "BTC/USD", symbol: "BINANCE:BTCUSDT", type: "crypto" },
  { name: "ETH/USD", symbol: "BINANCE:ETHUSDT", type: "crypto" },
  { name: "SOL/USD", symbol: "BINANCE:SOLUSDT", type: "crypto" },
]

const API_KEY = process.env.NEXT_PUBLIC_FINNHUB_TOKEN || "d28pij1r01qmp5u9t1j0d28pij1r01qmp5u9t1jg"

export function MarketTicker() {
  const [filter, setFilter] = useState("all")

  const filteredAssets = useMemo(() => {
    if (filter === "all") return assets
    return assets.filter((a) => a.type === filter)
  }, [filter])

  return (
    <div className="space-y-4">
      <Tabs defaultValue="all" onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="forex">Forex</TabsTrigger>
          <TabsTrigger value="crypto">Crypto</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {filteredAssets.map((asset) => (
          <AssetCard key={asset.symbol} {...asset} />
        ))}
      </div>
    </div>
  )
}

function AssetCard({ name, symbol }: { name: string; symbol: string }) {
  const { data, error, isLoading, mutate } = useSWR(
    `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`,
    fetcher,
    { refreshInterval: 15000 }
  )

  // const { data: candleData } = useSWR(
  //   `https://finnhub.io/api/v1/crypto/candle?symbol=${symbol}&resolution=5&count=10&token=${API_KEY}`,
  //   fetcher
  // )

  if (error) return <div className="text-destructive">Error loading {name}</div>

  const change = data?.c - data?.o
  const changePct = data?.o ? ((change / data.o) * 100).toFixed(2) : "0.00"
  const isUp = change >= 0

  return (
    <div className="bg-card p-4 rounded-lg shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{name}</h2>
          {isLoading ? (
            <Skeleton className="h-6 w-24 my-1" />
          ) : (
            <>
              <p className="text-2xl font-bold">{data?.c?.toFixed(2)}</p>
              <p className={`text-sm font-medium ${isUp ? "text-green-500" : "text-red-500"}`}>
                {isUp ? <ArrowUp className="inline w-4 h-4" /> : <ArrowDown className="inline w-4 h-4" />} {change?.toFixed(2)} ({changePct}%)
              </p>
            </>
          )}
        </div>
        <Button variant="outline" size="icon" onClick={() => mutate()}>
          <RefreshCw className="w-5 h-5" />
        </Button>
      </div>

      {data && (
        <p className="text-xs text-muted-foreground">
          H: {data.h?.toFixed(2)} | L: {data.l?.toFixed(2)}
        </p>
      )}

    
    </div>
  )
}
