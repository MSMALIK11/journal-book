interface Remark {
  id: number
  text: string
}

interface Stock {
  id: number
  symbol: string
  sector: string
  currentPrice?:string | number
  expectedPrice?: number | string
  expectedDirection: "Up" | "Down" | "Neutral"
  expectedNotes: string
  actualDirection?: "Up" | "Down" | "Neutral"
  actualNotes?: string
  remarks?: Remark[]
  resultDate: string
  event?: string
}
export type { Stock, Remark };