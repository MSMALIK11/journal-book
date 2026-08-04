import "server-only"

import bcrypt from "bcryptjs"
import connectDB from "@/app/api/db/mongoose"
import User from "@/app/api/models/User"
import { createDefaultTradingAccount } from "@/lib/trading-accounts-server"

export type PublicUser = {
  id: string
  email: string
  name?: string
}

function toPublicUser(user: { _id: unknown; email: string; name?: string }): PublicUser {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
  }
}

export async function authenticateUser(email: string, password: string) {
  await connectDB()
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select("+password")
  if (!user) return null

  const passwordMatches = await bcrypt.compare(password, user.password)
  return passwordMatches ? toPublicUser(user) : null
}

export async function createUser(email: string, password: string) {
  await connectDB()
  const normalizedEmail = email.toLowerCase().trim()
  const existingUser = await User.exists({ email: normalizedEmail })
  if (existingUser) return null

  const passwordHash = await bcrypt.hash(password, 12)

  try {
    const user = await User.create({
      email: normalizedEmail,
      password: passwordHash,
    })
    await createDefaultTradingAccount(String(user._id))
    return toPublicUser(user)
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === 11000
    ) {
      return null
    }
    throw error
  }
}

export async function findPublicUser(userId: string) {
  await connectDB()
  const user = await User.findById(userId).select("email name")
  return user ? toPublicUser(user) : null
}
