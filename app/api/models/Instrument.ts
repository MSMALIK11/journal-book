import mongoose, { type Model } from "mongoose"

export interface IInstrument {
  _id?: string
  userId: string
  symbol: string
  name: string
  assetType: "forex" | "metal" | "commodity" | "crypto" | "index" | "stock"
  baseCurrency: string
  quoteCurrency: string
  contractSize: number
  tickSize: number
  tickValue: number
  pipSize: number
  decimalPlaces: number
  minLot: number
  maxLot: number
  lotStep: number
  isDefault: boolean
  createdAt?: Date
  updatedAt?: Date
}

const InstrumentSchema = new mongoose.Schema<IInstrument>(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    assetType: {
      type: String,
      enum: ["forex", "metal", "commodity", "crypto", "index", "stock"],
      required: true,
      default: "crypto",
    },
    baseCurrency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 20,
    },
    contractSize: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 1,
    },
    tickSize: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 0.01,
    },
    tickValue: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 0.01,
    },
    pipSize: {
      type: Number,
      required: true,
      min: 0.00000001,
      default: 0.01,
    },
    quoteCurrency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 10,
      default: "USD",
    },
    decimalPlaces: {
      type: Number,
      required: true,
      min: 0,
      max: 10,
      default: 2,
    },
    minLot: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    maxLot: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    lotStep: {
      type: Number,
      required: true,
      min: 0.00000001,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
)

InstrumentSchema.index({ userId: 1, symbol: 1 }, { unique: true })

const Instrument: Model<IInstrument> =
  mongoose.models.Instrument || mongoose.model<IInstrument>("Instrument", InstrumentSchema)

export default Instrument
