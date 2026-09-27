import { z } from "zod"

export const accountPnlSourceSchema = z.enum(["tv", "calculated"])

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(60),
  symbols: z.array(z.string()).default([]),
  color: z.string().max(20).optional(),
  pnlSource: accountPnlSourceSchema.optional(),
})

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  symbols: z.array(z.string()).optional(),
  color: z.string().max(20).optional(),
  isDefault: z.boolean().optional(),
  pnlSource: accountPnlSourceSchema.optional(),
})
