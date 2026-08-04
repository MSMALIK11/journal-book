import { z } from "zod"

const optionalPositiveNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : Number(value)),
  z.number({ invalid_type_error: "Enter a valid number" }).positive("Must be greater than 0").optional(),
)

const requiredPositiveNumber = z.preprocess(
  (value) => Number(value),
  z.number({ invalid_type_error: "Enter a valid number" }).positive("Must be greater than 0"),
)

const optionalText = z.string().trim().max(1000).optional().default("")

export const tradeSchema = z
  .object({
    instrument: z.string().trim().min(1, "Instrument is required").max(40),
    trade_type: z.enum(["Buy", "Sell"], {
      required_error: "Choose Long or Short",
      invalid_type_error: "Choose Long or Short",
    }),
    order_type: z.enum(["Cash", "Futures", "Options"], {
      required_error: "Select a market type",
      invalid_type_error: "Select a market type",
    }),
    entry_date: z
      .string()
      .min(1, "Entry date is required")
      .refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid entry date"),
    exit_date: z
      .preprocess(
        (value) => (value === "" || value === null ? undefined : value),
        z
          .string()
          .refine((value) => !Number.isNaN(new Date(value).getTime()), "Enter a valid exit date")
          .optional(),
      ),
    entry_price: requiredPositiveNumber,
    exit_price: optionalPositiveNumber,
    quantity: requiredPositiveNumber,
    asset_type: z.enum(["forex", "metal", "commodity", "crypto", "index", "stock"]).default("crypto"),
    quantity_mode: z.enum(["lots", "units"]).default("units"),
    base_currency: z.string().trim().min(1).max(20),
    contract_size: z.coerce.number().positive().default(1),
    tick_size: z.coerce.number().positive().default(0.01),
    tick_value: z.coerce.number().positive().default(0.01),
    pip_size: z.coerce.number().positive().default(0.01),
    quote_currency: z.string().trim().min(3).max(10).default("USD"),
    decimal_places: z.coerce.number().int().min(0).max(10).default(2),
    min_lot: z.coerce.number().positive(),
    max_lot: z.coerce.number().positive(),
    lot_step: z.coerce.number().positive(),
    account_balance: optionalPositiveNumber,
    stop_loss: optionalPositiveNumber,
    target: optionalPositiveNumber,
    strategy: z.string().trim().max(80).optional().default(""),
    emotion_tag: z.string().trim().max(40).optional().default(""),
    confidence_rating: z.coerce.number().int().min(1).max(10).default(5),
    followed_plan: z.boolean().default(true),
    mistake_tag: z.string().trim().max(80).optional().default(""),
    setup_notes: optionalText,
    review_notes: optionalText,
    tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  })
  .superRefine((trade, ctx) => {
    if (trade.exit_date && new Date(trade.exit_date) < new Date(trade.entry_date)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exit_date"],
        message: "Exit must be after entry",
      })
    }

    if (trade.exit_price && !trade.exit_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exit_date"],
        message: "Add an exit date for a closed trade",
      })
    }

    if (trade.exit_date && !trade.exit_price) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["exit_price"],
        message: "Add an exit price for a closed trade",
      })
    }

    if (trade.quantity < trade.min_lot || trade.quantity > trade.max_lot) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: `Size must be between ${trade.min_lot} and ${trade.max_lot}`,
      })
    }

    const steps = (trade.quantity - trade.min_lot) / trade.lot_step
    if (Math.abs(steps - Math.round(steps)) > 0.000001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["quantity"],
        message: `Size must use increments of ${trade.lot_step}`,
      })
    }
  })

export type TradeFormValues = z.infer<typeof tradeSchema>
