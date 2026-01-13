import mongoose, { Schema, Document, Model } from "mongoose";

export interface IStrategy extends Document {
  userId: string;
  name: string;
  winRate: number;
  timeFrame?: string;
  notes?: string;
  instrument?: string;
  createdAt: Date;
  updatedAt: Date;
}
const StrategySchema: Schema<IStrategy> = new Schema(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    winRate: { type: Number, required: true },
    timeFrame: { type: String },
    notes: { type: String },
    instrument: { type: String },
  },
  { timestamps: true } // yeh automatically createdAt & updatedAt handle karega
);

// Model
const Strategy: Model<IStrategy> =
  mongoose.models.Strategy || mongoose.model<IStrategy>("Strategy", StrategySchema);

export default Strategy;
