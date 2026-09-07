import mongoose, { Schema, model, models, type Model } from "mongoose"

export type DeltaCredentialEnvironment = "demo" | "live"

export interface IBrokerCredential {
  _id?: string
  userId: mongoose.Types.ObjectId
  provider: "delta"
  environment?: DeltaCredentialEnvironment
  label: string
  isDefault?: boolean
  enabled?: boolean
  encryptedKey: string
  encryptedSecret: string
  lastFour?: string
  createdAt?: Date
  updatedAt?: Date
}

const BrokerCredentialSchema = new Schema<IBrokerCredential>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: ["delta"], required: true },
    environment: { type: String, enum: ["demo", "live"], default: "demo" },
    label: { type: String, required: true, trim: true, maxlength: 40 },
    isDefault: { type: Boolean, default: false },
    enabled: { type: Boolean, default: true },
    encryptedKey: { type: String, required: true },
    encryptedSecret: { type: String, required: true },
    lastFour: { type: String },
  },
  { timestamps: true },
)

BrokerCredentialSchema.index({ userId: 1, provider: 1 })
BrokerCredentialSchema.index({ userId: 1, provider: 1, environment: 1, label: 1 }, { unique: true })

// Re-register in dev so new schema fields (environment) persist after HMR.
if (process.env.NODE_ENV !== "production" && models.BrokerCredential) {
  delete models.BrokerCredential
}

const BrokerCredential: Model<IBrokerCredential> =
  models.BrokerCredential || model<IBrokerCredential>("BrokerCredential", BrokerCredentialSchema)

export default BrokerCredential
