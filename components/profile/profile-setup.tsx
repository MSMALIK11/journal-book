"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getCurrentUser, getProfile, updateProfile } from "@/lib/client-auth"
import { useToast } from "@/hooks/use-toast"

export function ProfileSetup() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState({
    name: "",
    mobile: "",
    trading_style: "",
    risk_profile: "",
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    async function loadUser() {
      const currentUser = await getCurrentUser()
      if (currentUser) {
        setUser(currentUser)
        const { data } = await getProfile()
        if (data) {
          setProfile({
            name: data.name || "",
            mobile: data.mobile || "",
            trading_style: data.trading_style || "",
            risk_profile: data.risk_profile || "",
          })
        }
      }
    }
    loadUser()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    const { data, error } = await updateProfile(profile)

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    } else {
      toast({
        title: "Success",
        description: "Profile updated successfully!",
      })
      router.push("/dashboard")
    }

    setLoading(false)
  }

  if (!user) {
    return <div>Loading...</div>
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Complete Your Profile</CardTitle>
          <CardDescription>Set up your trading preferences to get started</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="mobile">Mobile Number</Label>
              <Input
                id="mobile"
                value={profile.mobile}
                onChange={(e) => setProfile({ ...profile, mobile: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Trading Style</Label>
              <Select
                value={profile.trading_style}
                onValueChange={(value) => setProfile({ ...profile, trading_style: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trading style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Intraday">Intraday</SelectItem>
                  <SelectItem value="Swing">Swing</SelectItem>
                  <SelectItem value="Options">Options</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Risk Profile</Label>
              <Select
                value={profile.risk_profile}
                onValueChange={(value) => setProfile({ ...profile, risk_profile: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select risk profile" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Moderate">Moderate</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Saving..." : "Complete Setup"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
