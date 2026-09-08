import mongoose, { Schema, model, models, type Model } from "mongoose"
import type { DeltaCredentialEnvironment } from "@/app/api/models/BrokerCredential"

export interface IDeltaOrderLog {
  _id?: string
  userId: mongoose.Types.ObjectId
  environment?: DeltaCredentialEnvironment
  brokerAccountId?: mongoose.Types.ObjectId
  accountLabel?: string
  brokerOrderId?: string
  symbol: string
  side: "buy" | "sell"
  size: number
  price?: number
  source?: "manual" | "auto"
  tvTradeId?: string
  raw?: Record<string, unknown>
  createdAt?: Date
  updatedAt?: Date
}

const DeltaOrderLogSchema = new Schema<IDeltaOrderLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    environment: { type: String, enum: ["demo", "live"], default: "demo" },
    brokerAccountId: { type: Schema.Types.ObjectId, ref: "BrokerCredential", index: true },
    accountLabel: { type: String },
    brokerOrderId: { type: String },
    symbol: { type: String, required: true },
    side: { type: String, enum: ["buy", "sell"], required: true },
    size: { type: Number, required: true },
    price: { type: Number },
    source: { type: String, enum: ["manual", "auto"], default: "manual" },
    tvTradeId: { type: String },
    raw: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
)

DeltaOrderLogSchema.index({ userId: 1, environment: 1, createdAt: -1 })

const DeltaOrderLog: Model<IDeltaOrderLog> =
  models.DeltaOrderLog || model<IDeltaOrderLog>("DeltaOrderLog", DeltaOrderLogSchema)

export default DeltaOrderLog
