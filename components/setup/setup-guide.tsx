"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Trading Journal Setup</h1>
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
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                      {step.completed ? <CheckCircle className="h-4 w-4" /> : index + 1}
                    </div>
                    <div>
                      <CardTitle className="text-lg">{step.title}</CardTitle>
                      <CardDescription>{step.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant={step.completed ? "default" : "secondary"}>
                    {step.completed ? "Complete" : "Pending"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Need Help?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              If you need assistance with the setup process, check out the Supabase documentation or reach out for
              support.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <a href="https://supabase.com/docs" target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Supabase Docs
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
