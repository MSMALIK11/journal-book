"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

export function DemoAuth() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  const handleDemoLogin = () => {
    setLoading(true)

    // Create demo user data
    const demoUser = {
      id: "demo-user-123",
      email: "demo@tradingjournal.com",
      name: "Demo User",
    }

    const demoToken = "demo-token-123"

    // Store demo data
    localStorage.setItem("auth_token", demoToken)
    localStorage.setItem("user_data", JSON.stringify(demoUser))
    localStorage.setItem("demo_mode", "true")

    toast({
      title: "Demo Mode",
      description: "Welcome to the demo! Your data won't be saved permanently.",
    })

    setTimeout(() => {
      router.push("/dashboard")
    }, 1000)
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Trading Journal</CardTitle>
          <CardDescription>Track your trades and improve your performance</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              MongoDB is not configured. You can try the demo mode to explore the features.
            </AlertDescription>
          </Alert>

          <Button onClick={handleDemoLogin} className="w-full" disabled={loading}>
            {loading ? "Loading Demo..." : "Try Demo Mode"}
          </Button>

          <div className="text-center text-sm text-muted-foreground">
            <p>To use with real data, configure MongoDB connection</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
