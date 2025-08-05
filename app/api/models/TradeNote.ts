import mongoose from "mongoose"

export interface ITradeNote {
  _id?: string
  userId: string
  tradeId?: string
  note_type: "global" | "trade"
  title?: string
  content: string
  createdAt?: Date
  updatedAt?: Date
}

const TradeNoteSchema = new mongoose.Schema<ITradeNote>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    tradeId: {
      type: String,
    },
    note_type: {
      type: String,
      required: true,
      enum: ["global", "trade"],
    },
    title: {
      type: String,
    },
    content: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  },
)

export default mongoose.models.TradeNote || mongoose.model<ITradeNote>("TradeNote", TradeNoteSchema)
