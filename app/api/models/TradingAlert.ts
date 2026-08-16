import mongoose, { Schema, model, models, Model } from "mongoose"

export type AlertSeverity = "danger" | "warning" | "success" | "info"
export type AlertCategory =
  | "hour"
  | "weekday"
  | "session"
  | "season"
  | "instrument_session"
  | "streak"
  | "today"
  | "digest"
  | "behavior_tilt"
  | "behavior_overtrade"
  | "behavior_recovery"
  | "research_edge"
  | "research_leak"
  | "analytics_avoid"
  | "analytics_best"
  | "session_deadzone"
  | "session_overlap"
  | "session_key"
  | "avoidance_impact"
  | "drawdown_warning"
  | "weekly_momentum"
  | "session_boundary"
  | "new_trade"

export interface ITradingAlert {
  _id?: string
  userId: string
  accountId: string
  key: string
  category: AlertCategory
  severity: AlertSeverity
  title: string
  message: string
  metric?: string
  action?: string
  context?: Record<string, unknown>
  read: boolean
  triggeredAt: Date
  createdAt?: Date
  updatedAt?: Date
}

const TradingAlertSchema = new Schema<ITradingAlert>(
  {
    userId: { type: String, required: true, index: true },
    accountId: { type: String, required: true, index: true },
    key: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "hour",
        "weekday",
        "session",
        "season",
        "instrument_session",
        "streak",
        "today",
        "digest",
        "behavior_tilt",
        "behavior_overtrade",
        "behavior_recovery",
        "research_edge",
        "research_leak",
        "analytics_avoid",
        "analytics_best",
        "session_deadzone",
        "session_overlap",
        "session_key",
        "avoidance_impact",
        "drawdown_warning",
        "weekly_momentum",
        "session_boundary",
        "new_trade",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["danger", "warning", "success", "info"],
      required: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metric: { type: String },
    action: { type: String },
    context: { type: Schema.Types.Mixed },
    read: { type: Boolean, default: false },
    triggeredAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
)

TradingAlertSchema.index({ userId: 1, accountId: 1, triggeredAt: -1 })
TradingAlertSchema.index({ userId: 1, accountId: 1, key: 1 }, { unique: true })

if (process.env.NODE_ENV !== "production" && models.TradingAlert) {
  delete models.TradingAlert
}

const TradingAlert: Model<ITradingAlert> =
  models.TradingAlert || model<ITradingAlert>("TradingAlert", TradingAlertSchema)

export default TradingAlert
