import mongoose, { Schema, model, models, type Model } from "mongoose"
import type { DeltaCredentialEnvironment } from "@/app/api/models/BrokerCredential"

export type DeltaAutoTradeLogStatus = "success" | "partial" | "failed" | "skipped"

export type DeltaAutoTradeAccountResult = {
  accountId: string
  label: string
  ok: boolean
  brokerOrderId?: string
  error?: string
}

export interface IDeltaAutoTradeLog {
  _id?: string
  userId: mongoose.Types.ObjectId
  environment: DeltaCredentialEnvironment
  tvTradeId: string
  fillReason: string
  kind: "open" | "close"
  status: DeltaAutoTradeLogStatus
  symbol?: string
  side?: "buy" | "sell"
  lots?: number
  tvInstrument?: string
  tvTradeType?: string
  accountResults?: DeltaAutoTradeAccountResult[]
  error?: string
  createdAt?: Date
  updatedAt?: Date
}

const DeltaAutoTradeLogSchema = new Schema<IDeltaAutoTradeLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    environment: { type: String, enum: ["demo", "live"], required: true },
    tvTradeId: { type: String, required: true },
    fillReason: { type: String, required: true, default: "unknown" },
    kind: { type: String, enum: ["open", "close"], required: true },
    status: { type: String, enum: ["success", "partial", "failed", "skipped"], required: true },
    symbol: { type: String },
    side: { type: String, enum: ["buy", "sell"] },
    lots: { type: Number },
    tvInstrument: { type: String },
    tvTradeType: { type: String },
    accountResults: { type: Schema.Types.Mixed },
    error: { type: String },
  },
  { timestamps: true },
)

DeltaAutoTradeLogSchema.index({ userId: 1, environment: 1, createdAt: -1 })
DeltaAutoTradeLogSchema.index(
  { userId: 1, environment: 1, tvTradeId: 1, kind: 1, fillReason: 1 },
  { unique: true },
)

const DeltaAutoTradeLog: Model<IDeltaAutoTradeLog> =
  models.DeltaAutoTradeLog || model<IDeltaAutoTradeLog>("DeltaAutoTradeLog", DeltaAutoTradeLogSchema)

export default DeltaAutoTradeLog
