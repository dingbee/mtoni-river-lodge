import { z } from "zod";

export const recordManualPaymentInputSchema = z.object({
  bookingId: z.string().uuid(),
  amount: z.number().positive().finite(),
  method: z.string().trim().min(2).max(40),
  note: z.string().max(500).optional(),
  idempotencyKey: z.string().uuid(),
  eventType: z.enum(["manual_payment", "refund"]).default("manual_payment"),
});

export type RecordManualPaymentInput = z.infer<typeof recordManualPaymentInputSchema>;
