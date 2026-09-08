export type DeltaEnvironment = "demo" | "live"

export function parseDeltaEnvironment(value: string | null | undefined): DeltaEnvironment {
  return value === "live" ? "live" : "demo"
}

export function deltaEnvironmentQuery(environment: DeltaEnvironment): string {
  return `environment=${environment}`
}

export function withDeltaEnvironment(path: string, environment: DeltaEnvironment): string {
  const separator = path.includes("?") ? "&" : "?"
  return `${path}${separator}${deltaEnvironmentQuery(environment)}`
}
