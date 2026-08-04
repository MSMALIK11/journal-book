import mongoose, { type Model } from "mongoose"

export interface ITradingAccount {
  _id?: string
  userId: string
  name: string
  symbols: string[]
  isDefault: boolean
  color?: string
  createdAt?: Date
  updatedAt?: Date
}

const TradingAccountSchema = new mongoose.Schema<ITradingAccount>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    symbols: {
      type: [String],
      default: [],
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    color: {
      type: String,
      maxlength: 20,
    },
  },
  { timestamps: true },
)

TradingAccountSchema.index({ userId: 1, isDefault: 1 })

const TradingAccount: Model<ITradingAccount> =
  mongoose.models.TradingAccount ||
  mongoose.model<ITradingAccount>("TradingAccount", TradingAccountSchema)

export default TradingAccount
