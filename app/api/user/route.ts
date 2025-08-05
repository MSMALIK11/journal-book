// pages/api/auth/current-user.ts
import { NextApiRequest, NextApiResponse } from "next"
import jwt from "jsonwebtoken"
import { connectDB } from "@/app/api/db/mongodb"
import User from "@/app/api/models/User"

const JWT_SECRET = process.env.JWT_SECRET || "default_secret"

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectDB()

  const token = req.headers.authorization?.split(" ")[1]

  if (!token) {
    return res.status(401).json({ message: "No token provided" })
  }

  try {
    const decoded: any = jwt.verify(token, JWT_SECRET)
    const user = await User.findById(decoded._id).select("-password")
    if (!user) return res.status(404).json({ message: "User not found" })

    return res.status(200).json(user)
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" })
  }
}
