"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, TrendingUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"

type AuthMode = "signin" | "signup"

export function AuthForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [mode, setMode] = useState<AuthMode>("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (mode === "signup" && password !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Enter the same password in both fields.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || "Authentication failed")

      toast({
        title: mode === "signin" ? "Welcome back" : "Account created",
        description: "Your secure session is now active.",
      })
      router.replace("/dashboard")
      router.refresh()
    } catch (error) {
      toast({
        title: mode === "signin" ? "Sign in failed" : "Sign up failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const changeMode = (value: string) => {
    setMode(value as AuthMode)
    setPassword("")
    setConfirmPassword("")
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070a] hud-grid px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_35%)]" />
      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-xl border border-cyan-400/20 bg-card/85 shadow-[0_12px_40px_rgba(0,0,0,0.28)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden flex-col justify-between border-r border-cyan-400/15 bg-[#06080c] p-10 lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 p-2.5 text-cyan-300">
                <TrendingUp className="h-5 w-5" />
              </div>
              <span className="text-lg font-semibold text-cyan-100">Trading Journal</span>
            </div>
            <h1 className="mt-16 text-4xl font-semibold leading-tight tracking-tight text-cyan-50">
              Improve your process, one trade at a time.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Securely log executions, review your decisions, and turn trading data into repeatable discipline.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-cyan-400/20 bg-[#05070a]/70 p-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-500" />
            <p className="text-xs leading-5 text-muted-foreground">
              Passwords are hashed and your session is stored in a secure httpOnly cookie.
            </p>
          </div>
        </section>

        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="px-6 pb-2 pt-8 sm:px-10 sm:pt-10">
            <div className="mb-5 flex items-center gap-2 lg:hidden">
              <div className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 p-2 text-cyan-300">
                <TrendingUp className="h-4 w-4" />
              </div>
              <span className="font-semibold text-cyan-100">Trading Journal</span>
            </div>
            <CardTitle className="text-2xl text-cyan-100">Access your journal</CardTitle>
            <CardDescription>Sign in or create your private trading workspace.</CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-8 sm:px-10 sm:pb-10">
            <Tabs value={mode} onValueChange={changeMode} className="mt-5">
              <TabsList className="grid h-11 w-full grid-cols-2 border border-cyan-400/20 bg-[#05070a]">
                <TabsTrigger value="signin" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="data-[state=active]:bg-cyan-400/15 data-[state=active]:text-cyan-200">Create account</TabsTrigger>
              </TabsList>

              <form onSubmit={submit}>
                <TabsContent value={mode} className="mt-6 space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="auth-email">Email address</Label>
                    <Input
                      id="auth-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="h-11"
                      required
                      maxLength={254}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="auth-password">Password</Label>
                    <div className="relative">
                      <LockKeyhole className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="auth-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete={mode === "signin" ? "current-password" : "new-password"}
                        placeholder={mode === "signin" ? "Enter your password" : "At least 10 characters"}
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="h-11 px-10"
                        required
                        minLength={mode === "signup" ? 10 : 1}
                        maxLength={72}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((visible) => !visible)}
                        className="absolute right-3 top-3 text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {mode === "signup" && (
                      <p className="text-xs text-muted-foreground">
                        Use 10–72 characters with uppercase, lowercase, and a number.
                      </p>
                    )}
                  </div>

                  {mode === "signup" && (
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm password</Label>
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(event) => setConfirmPassword(event.target.value)}
                        className="h-11"
                        required
                        minLength={10}
                        maxLength={72}
                      />
                    </div>
                  )}

                  <Button type="submit" className="h-11 w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading
                      ? mode === "signin" ? "Signing in..." : "Creating account..."
                      : mode === "signin" ? "Sign in securely" : "Create secure account"}
                  </Button>
                </TabsContent>
              </form>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
