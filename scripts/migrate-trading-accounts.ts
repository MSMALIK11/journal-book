/**
 * One-time migration: create default TradingAccount per user and attach accountId to trades.
 * Run: npx tsx scripts/migrate-trading-accounts.ts
 */
import mongoose from "mongoose"
import connectDB from "../app/api/db/mongoose"
import Trade from "../app/api/models/Trade"
import TradingAccount from "../app/api/models/TradingAccount"
import User from "../app/api/models/User"

async function migrate() {
  await connectDB()

  const users = await User.find({}).select("_id").lean()
  let accountsCreated = 0
  let tradesUpdated = 0

  for (const user of users) {
    const userId = String(user._id)
    let account = await TradingAccount.findOne({ userId, isDefault: true })

    if (!account) {
      account = await TradingAccount.findOne({ userId })
    }

    if (!account) {
      account = await TradingAccount.create({
        userId,
        name: "Main",
        symbols: [],
        isDefault: true,
      })
      accountsCreated += 1
      console.log(`Created Main account for user ${userId}`)
    }

    const accountId = String(account._id)
    const result = await Trade.updateMany(
      {
        userId,
        $or: [{ accountId: { $exists: false } }, { accountId: null }, { accountId: "" }],
      },
      { $set: { accountId } },
    )
    tradesUpdated += result.modifiedCount
  }

  console.log(`Done. Accounts created: ${accountsCreated}, trades updated: ${tradesUpdated}`)
  await mongoose.disconnect()
}

migrate().catch((error) => {
  console.error("Migration failed:", error)
  process.exit(1)
})
