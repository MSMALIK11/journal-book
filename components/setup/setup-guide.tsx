"use client"

import { HudPanel, HudPanelHeader } from "@/components/dashboard/hud-panel"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ExternalLink, Database, Key, CheckCircle } from "lucide-react"

export function SetupGuide() {
  const steps = [
    {
      title: "Create Supabase Project",
      description: "Sign up for Supabase and create a new project",
      action: "Go to Supabase",
      url: "https://supabase.com/dashboard",
      completed: false,
    },
    {
      title: "Set Environment Variables",
      description: "Add your Supabase URL and anon key to environment variables",
      action: "Configure",
      completed: false,
    },
    {
      title: "Run Database Scripts",
      description: "Execute the SQL scripts to set up your database schema",
      action: "Run Scripts",
      completed: false,
    },
  ]

  return (
    <div className="min-h-screen bg-background hud-grid flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <p className="hud-label">Setup</p>
          <h1 className="text-2xl font-semibold text-cyan-100">Trading Journal</h1>
          <p className="text-muted-foreground">Let's get your trading journal configured and ready to use</p>
        </div>

        <Alert>
          <Database className="h-4 w-4" />
          <AlertDescription>
            Your trading journal needs to be connected to Supabase to store your data securely. Follow the steps below
            to complete the setup.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          {steps.map((step, index) => (
            <HudPanel key={index}>
              <div className="flex items-center justify-between border-b border-cyan-400/10 px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10 text-sm font-medium text-cyan-300">
                      {step.completed ? <CheckCircle className="h-4 w-4" /> : index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={step.completed ? "border-emerald-400/30 text-emerald-400" : "border-cyan-400/20 text-cyan-300/80"}>
                    {step.completed ? "Complete" : "Pending"}
                  </Badge>
              </div>
              <div className="p-5">
                {index === 0 && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      1. Go to{" "}
                      <a
                        href="https://supabase.com"
                        className="text-primary hover:underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        supabase.com
                      </a>{" "}
                      and create an account
                    </p>
                    <p className="text-sm text-muted-foreground">2. Create a new project</p>
                    <p className="text-sm text-muted-foreground">3. Wait for the database to be ready</p>
                    <Button asChild>
                      <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open Supabase Dashboard
                      </a>
                    </Button>
                  </div>
                )}

                {index === 1 && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Add these environment variables to your project:</p>
                    <div className="bg-muted p-4 rounded-lg font-mono text-sm">
                      <div>NEXT_PUBLIC_SUPABASE_URL=your_project_url</div>
                      <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key</div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      You can find these values in your Supabase project settings under "API"
                    </p>
                  </div>
                )}

                {index === 2 && (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Run the SQL scripts in your Supabase SQL Editor to create the necessary tables:
                    </p>
                    <div className="space-y-2">
                      <Badge variant="outline">scripts/01-create-tables.sql</Badge>
                      <Badge variant="outline">scripts/02-seed-data.sql</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      These scripts will create the database schema for users, trades, and analytics.
                    </p>
                  </div>
                )}
              </div>
            </HudPanel>
          ))}
        </div>

        <HudPanel>
          <HudPanelHeader title="Need Help?" action={<Key className="h-4 w-4 text-cyan-300" />} />
          <div className="p-5">
            <p className="text-sm text-muted-foreground mb-4">
              If you need assistance with the setup process, check out the Supabase documentation or reach out for
              support.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" className="border-cyan-400/20" asChild>
                <a href="https://supabase.com/docs" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Supabase Docs
                </a>
              </Button>
            </div>
          </div>
        </HudPanel>
      </div>
    </div>
  )
}
