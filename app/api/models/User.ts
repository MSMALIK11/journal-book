import mongoose, { Schema, model, models, Model } from 'mongoose';

export interface IUser {
  _id?: string;
  email: string;
  password: string;
  name?: string;
  mobile?: string;
  trading_style?: 'Intraday' | 'Swing' | 'Options';
  risk_profile?: 'Low' | 'Moderate' | 'High';
  timezone?: string;
  theme?: string;
  sync_api_key?: string;
  sync_last_heartbeat?: Date;
  sync_poll_interval_seconds?: number;
  sync_refresh_requested_at?: Date;
  sync_refresh_last_result?: Record<string, unknown>;
  sync_last_trade_event?: {
    eventId?: string;
    at?: string;
    accountId?: string;
    accountName?: string;
    imported?: number;
    updated?: number;
    skipped?: number;
  };
  alertPreferences?: {
    dailyDigest?: boolean;
    weakHours?: boolean;
    weakDays?: boolean;
    weakSessions?: boolean;
    edgeAlerts?: boolean;
    streakWarnings?: boolean;
    seasonAlerts?: boolean;
    instrumentSession?: boolean;
    todaySummary?: boolean;
    behaviorAlerts?: boolean;
    researchAlerts?: boolean;
    deadZoneAlerts?: boolean;
    overlapAlerts?: boolean;
    keySessionAlerts?: boolean;
  };
  tradeAlarmPreferences?: {
    enabled?: boolean;
    soundMode?: "once" | "manual";
    soundId?: "urgent-simple-tone-loop" | "classic-alarm";
  };
  autoExportPreferences?: {
    enabled?: boolean;
    monthlyEnabled?: boolean;
    time?: string;
    folderName?: string;
    lastExportDayKey?: string;
    lastExportAt?: string;
    lastExportPath?: string;
    lastExportCount?: number;
    lastMonthlyExportMonthKey?: string;
    lastMonthlyExportAt?: string;
    lastMonthlyExportPath?: string;
    lastMonthlyExportCount?: number;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    name: String,
    mobile: String,
    trading_style: {
      type: String,
      enum: ['Intraday', 'Swing', 'Options'],
    },
    risk_profile: {
      type: String,
      enum: ['Low', 'Moderate', 'High'],
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata',
    },
    theme: {
      type: String,
      default: 'light',
    },
    sync_api_key: {
      type: String,
      index: true,
      sparse: true,
    },
    sync_last_heartbeat: {
      type: Date,
    },
    sync_poll_interval_seconds: {
      type: Number,
      default: 30,
    },
    sync_refresh_requested_at: {
      type: Date,
    },
    sync_refresh_last_result: {
      type: Schema.Types.Mixed,
    },
    sync_last_trade_event: {
      type: Schema.Types.Mixed,
    },
    alertPreferences: {
      type: Schema.Types.Mixed,
      default: {},
    },
    tradeAlarmPreferences: {
      type: Schema.Types.Mixed,
      default: {},
    },
    autoExportPreferences: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Re-register in dev so new schema fields (sync_refresh_*) are picked up after HMR.
if (process.env.NODE_ENV !== "production" && models.User) {
  delete models.User
}

const User: Model<IUser> = models.User || model<IUser>("User", UserSchema)

export default User;
