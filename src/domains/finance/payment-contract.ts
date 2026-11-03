import { z } from "zod";

export const recordManualPaymentInputSchema = z
  .object({
    bookingId: z.string().uuid(),
    amount: z
      .number()
      .positive()
      .finite()
      .refine((amount) => Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-8, "Amount must have at most two decimal places"),
    method: z.string().trim().min(2).max(40),
    note: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid(),
    eventType: z.enum(["manual_payment", "refund"]).default("manual_payment"),
    originalPaymentEventId: z.string().uuid().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.eventType === "refund" && !value.note) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "A refund reason is required",
      });
    }
    if (value.eventType === "refund" && !value.originalPaymentEventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originalPaymentEventId"],
        message: "Select the original successful payment being refunded",
      });
    }
    if (value.eventType === "manual_payment" && value.originalPaymentEventId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originalPaymentEventId"],
        message: "Original payment reference is only valid for refunds",
      });
    }
  });

export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentInputSchema>;
