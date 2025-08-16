// models/Instruments.ts
import mongoose, { Schema, Document } from "mongoose";

export interface InstrumentDoc extends Document {
  category: string;
  symbol: string;
  size: number;
}

const InstrumentsSchema = new Schema<InstrumentDoc>({
  category: { type: String, required: true },
  symbol: { type: String, required: true },
  size: { type: Number, required: true },
});

// 🔹 Unique index on category + symbol
InstrumentsSchema.index({ category: 1, symbol: 1 }, { unique: true });

const Instruments =
  mongoose.models.Instruments ||
  mongoose.model<InstrumentDoc>("Instruments", InstrumentsSchema);

export default Instruments;
