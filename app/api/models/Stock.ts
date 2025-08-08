import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRemark {
  id: number;
  text: string;
}

export interface IStock extends Document {
  userId: string;
  symbol: string;
  sector: string;
  currentPrice?: string | number;
  expectedPrice?: string | number;
  expectedDirection: "Up" | "Down" | "Neutral";
  expectedNotes: string;
  actualDirection?: "Up" | "Down" | "Neutral";
  actualNotes?: string;
  remarks?: IRemark[];
  resultDate: string; // or Date
  event?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RemarkSchema = new Schema<IRemark>({
  id: { type: Number, required: true },
  text: { type: String, required: true },
});

const StockSchema = new Schema<IStock>(
  {
    userId: { type: String, required: true, index: true }, // link to user
    symbol: { type: String, required: true, uppercase: true, trim: true },
    sector: { type: String, required: true, trim: true },
    currentPrice: { type: Schema.Types.Mixed }, // string or number
    expectedPrice: { type: Schema.Types.Mixed },
    expectedDirection: {
      type: String,
      enum: ["Up", "Down", "Neutral"],
      required: true,
      default: "Neutral",
    },
    expectedNotes: { type: String, required: true },
    actualDirection: { type: String, enum: ["Up", "Down", "Neutral"] },
    actualNotes: { type: String },
    remarks: { type: [RemarkSchema], default: [] },
    resultDate: { type: String, required: true }, // you can also use Date type if preferred
    event: { type: String },
  },
  { timestamps: true }
);

const Stock: Model<IStock> = mongoose.models.Stock || mongoose.model<IStock>("Stock", StockSchema);

export default Stock;
