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
    },
    password: {
      type: String,
      required: true,
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
  },
  {
    timestamps: true,
  }
);

// ✅ Prevent model overwrite in development (HMR safe)
const User: Model<IUser> = models?.User || model<IUser>('User', UserSchema);

export default User;
