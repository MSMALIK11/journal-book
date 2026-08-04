import mongoose from "mongoose"

export interface ITrade {
  _id?: string
  userId: string
  accountId: string
  instrument: string
  entry_date: Date
  exit_date?: Date
  trade_type: "Buy" | "Sell"
  order_type: "Cash" | "Futures" | "Options"
  entry_price: number
  exit_price?: number
  quantity: number
  asset_type?: "forex" | "metal" | "commodity" | "crypto" | "index" | "stock"
  quantity_mode?: "lots" | "units"
  base_currency?: string
  contract_size?: number
  tick_size?: number
  tick_value?: number
  pip_size?: number
  quote_currency?: string
  decimal_places?: number
  min_lot?: number
  max_lot?: number
  lot_step?: number
  account_balance?: number
  stop_loss?: number
  target?: number
  net_pnl?: number
  strategy?: string
  emotion_tag?: string
  confidence_rating?: number
  followed_plan?: boolean
  mistake_tag?: string
  setup_notes?: string
  review_notes?: string
  screenshot_url?: string
  tags?: string[]
  source?: "manual" | "tradingview"
  external_id?: string
  commission?: number
  return_pct?: number
  signal?: string
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
    accountId: {
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
    order_type: {
      type: String,
      required: true,
      enum: ["Cash", "Futures", "Options"],
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
    asset_type: {
      type: String,
      enum: ["forex", "metal", "commodity", "crypto", "index", "stock"],
    },
    quantity_mode: {
      type: String,
      enum: ["lots", "units"],
    },
    base_currency: {
      type: String,
      uppercase: true,
    },
    contract_size: {
      type: Number,
      min: 0.00000001,
    },
    tick_size: {
      type: Number,
      min: 0.00000001,
    },
    tick_value: {
      type: Number,
      min: 0.00000001,
    },
    pip_size: {
      type: Number,
      min: 0.00000001,
    },
    quote_currency: {
      type: String,
      uppercase: true,
    },
    decimal_places: {
      type: Number,
      min: 0,
      max: 10,
    },
    min_lot: {
      type: Number,
      min: 0.00000001,
    },
    max_lot: {
      type: Number,
      min: 0.00000001,
    },
    lot_step: {
      type: Number,
      min: 0.00000001,
    },
    account_balance: {
      type: Number,
      min: 0,
    },
    stop_loss: {
      type: Number,
    },
    target: {
      type: Number,
    },
    net_pnl: {
      type: Number,
    },
    strategy: {
      type: String,
    },
    emotion_tag: {
      type: String,
    },
    confidence_rating: {
      type: Number,
      min: 1,
      max: 10,
    },
    followed_plan: {
      type: Boolean,
      default: true,
    },
    mistake_tag: {
      type: String,
    },
    setup_notes: {
      type: String,
    },
    review_notes: {
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
    source: {
      type: String,
      enum: ["manual", "tradingview"],
      default: "manual",
    },
    external_id: {
      type: String,
    },
    commission: {
      type: Number,
    },
    return_pct: {
      type: Number,
    },
    signal: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

// Create indexes for better performance
TradeSchema.index({ accountId: 1, entry_date: -1 })
TradeSchema.index({ accountId: 1, strategy: 1 })
TradeSchema.index({ accountId: 1, instrument: 1 })
TradeSchema.index({ accountId: 1, external_id: 1 }, { unique: true, sparse: true })
TradeSchema.index({ accountId: 1, source: 1, entry_date: -1 })
TradeSchema.index({ userId: 1, accountId: 1 })

export default mongoose.models.Trade || mongoose.model<ITrade>("Trade", TradeSchema)
