import { z } from "zod"

const email = z.string().trim().email("Enter a valid email address").max(254).transform((value) => value.toLowerCase())

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72, "Password is too long"),
})

export const signUpSchema = z.object({
  email,
  password: z
    .string()
    .min(10, "Use at least 10 characters")
    .max(72, "Password is too long")
    .regex(/[a-z]/, "Add a lowercase letter")
    .regex(/[A-Z]/, "Add an uppercase letter")
    .regex(/[0-9]/, "Add a number"),
})
