import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import User, { type IUser } from "../app/api/models/User"
import connectDB from "../app/api/db/mongoose"

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key"

export async function signUp(email: string, password: string) {
  try {
    await connectDB()

    // Check if user already exists
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return { data: null, error: { message: "User already exists" } }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12)

    // Create user
    const user = await User.create({
      email,
      password: hashedPassword,
    })

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" })

    return {
      data: {
        user: {
          id: user._id,
          email: user.email,
        },
        token,
      },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function signIn(email: string, password: string) {
  try {
    await connectDB()

    // Find user
    const user = await User.findOne({ email })
    if (!user) {
      return { data: null, error: { message: "Invalid credentials" } }
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password)
    if (!isValidPassword) {
      return { data: null, error: { message: "Invalid credentials" } }
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: "7d" })

    return {
      data: {
        user: {
          id: user._id,
          email: user.email,
        },
        token,
      },
      error: null,
    }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export function signOut() {
  // For JWT, we'll handle this on the client side by removing the token
  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token")
    localStorage.removeItem("user_data")
  }
  return { error: null }
}

export async function getCurrentUser() {
  if (typeof window === "undefined") return null

  const token = localStorage.getItem("auth_token")
  if (!token) return null

  try {
    const res = await fetch("/api/auth/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) throw new Error("Failed to fetch user")
    return await res.json()
  } catch (error) {
    console.error("Error fetching current user:", error)
    localStorage.removeItem("auth_token")
    localStorage.removeItem("user_data")
    return null
  }
}

export async function getProfile(userId: string) {
  try {
    await connectDB()
    const user = await User.findById(userId).select("-password")
    return { data: user, error: null }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export async function updateProfile(userId: string, updates: Partial<IUser>) {
  try {
    await connectDB()
    const user = await User.findByIdAndUpdate(
      userId,
      { ...updates, updatedAt: new Date() },
      { new: true, select: "-password" },
    )
    return { data: user, error: null }
  } catch (error: any) {
    return { data: null, error: { message: error.message } }
  }
}

export function verifyToken(token: string) {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string }
  } catch (error) {
    return null
  }
}
