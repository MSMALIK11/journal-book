"use client"

import { useState, useEffect } from "react"
import { AuthForm } from "@/components/auth/auth-form"
import { DemoAuth } from "@/components/demo/demo-auth"

export default function HomePage() {
  const [showDemo, setShowDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if MongoDB is configured
    const checkMongoDB = async () => {
      try {
        const response = await fetch("/api/health")
        if (!response.ok) {
          setShowDemo(true)
        }
      } catch (error) {
        setShowDemo(true)
      } finally {
        setLoading(false)
      }
    }

    checkMongoDB()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (showDemo) {
    return <DemoAuth />
  }

  return <AuthForm />
}
