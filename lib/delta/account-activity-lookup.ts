import type { DeltaAccountActivityRow } from "@/lib/delta/account-activity"

export function activityForAccount(
  rows: DeltaAccountActivityRow[] | undefined,
  accountId: string,
): DeltaAccountActivityRow | undefined {
  return rows?.find((r) => r.accountId === accountId)
}
