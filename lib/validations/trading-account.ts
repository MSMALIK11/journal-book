import { z } from "zod"

export const accountPnlSourceSchema = z.enum(["tv", "calculated"])

/** Starting capital for the portfolio; the denominator for return %. null clears it. */
const initialCapitalSchema = z
  .number()
  .nonnegative()
  .max(1_000_000_000_000)
  .nullish()

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  symbols: z.array(z.string()).default([]),
  color: z.string().max(20).optional(),
  pnlSource: accountPnlSourceSchema.optional(),
  initialCapital: initialCapitalSchema.optional(),
})

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  symbols: z.array(z.string()).optional(),
  color: z.string().max(20).optional(),
  isDefault: z.boolean().optional(),
  pnlSource: accountPnlSourceSchema.optional(),
  initialCapital: initialCapitalSchema,
})
