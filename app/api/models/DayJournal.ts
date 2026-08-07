import mongoose, { Schema, Document } from "mongoose"

export type ProcessFollowed = "yes" | "partial" | "no"
export type DayGrade = "A" | "B" | "C" | "D" | "F"

export interface IDayJournal extends Document {
  userId: string
  accountId: string
  dateKey: string
  whatWentWell: string
  whatWentWrong: string
  lessonsLearned: string
  marketRead: string
  tomorrowPlan: string
  processFollowed?: ProcessFollowed | null
  dayGrade?: DayGrade | null
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

const DayJournalSchema = new Schema<IDayJournal>(
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
    dateKey: {
      type: String,
      required: true,
    },
    whatWentWell: {
      type: String,
      default: "",
    },
    whatWentWrong: {
      type: String,
      default: "",
    },
    lessonsLearned: {
      type: String,
      default: "",
    },
    marketRead: {
      type: String,
      default: "",
    },
    tomorrowPlan: {
      type: String,
      default: "",
    },
    processFollowed: {
      type: String,
      enum: ["yes", "partial", "no"],
      default: undefined,
    },
    dayGrade: {
      type: String,
      enum: ["A", "B", "C", "D", "F"],
      default: undefined,
    },
    tags: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true,
  },
)

DayJournalSchema.index({ userId: 1, accountId: 1, dateKey: 1 }, { unique: true })

export default mongoose.models.DayJournal ||
  mongoose.model<IDayJournal>("DayJournal", DayJournalSchema)
