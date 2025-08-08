import mongoose from "mongoose"

export interface ITrade {
  _id?: string
  userId: string
  instrument: string
  entry_date: Date
  exit_date?: Date
  trade_type: "Buy" | "Sell"
  entry_price: number
  exit_price?: number
  quantity: number
  stop_loss?: number
  target?: number
  net_pnl?: string
  strategy?: string
  emotion_tag?: string
  setup_notes?: string
  screenshot_url?: string
  tags?: string[]
  createdAt?: Date
  updatedAt?: Date
}

const TradeSchema = new mongoose.Schema<ITrade>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    instrument: {
      type: String,
      required: true,
    },
    entry_date: {
      type: Date,
      required: true,
    },
    exit_date: {
      type: Date,
    },
    trade_type: {
      type: String,
      required: true,
      enum: ["Buy", "Sell"],
    },
    entry_price: {
      type: Number,
      required: true,
    },
    exit_price: {
      type: Number,
    },
    quantity: {
      type: Number,
      required: true,
    },
    stop_loss: {
      type: Number,
    },
    target: {
      type: Number,
    },
    net_pnl: {
      type: String,
    },
    strategy: {
      type: String,
    },
    emotion_tag: {
      type: String,
    },
    setup_notes: {
      type: String,
    },
    screenshot_url: {
      type: String,
    },
    tags: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  },
)

// Create indexes for better performance
TradeSchema.index({ userId: 1, entry_date: -1 })
TradeSchema.index({ userId: 1, strategy: 1 })
TradeSchema.index({ userId: 1, instrument: 1 })

export default mongoose.models.Trade || mongoose.model<ITrade>("Trade", TradeSchema)
