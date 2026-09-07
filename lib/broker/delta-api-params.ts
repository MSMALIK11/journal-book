import type { NextRequest } from "next/server"
import { parseDeltaEnvironment, type DeltaEnvironment } from "@/lib/broker/delta-env"

export function getDeltaEnvironmentFromRequest(request: NextRequest): DeltaEnvironment {
  return parseDeltaEnvironment(request.nextUrl.searchParams.get("environment"))
}
