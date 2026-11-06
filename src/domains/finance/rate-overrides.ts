import { z } from "zod";

export const rateOverrideSchema = z.object({
  id: z.string().uuid().optional(),
  scope: z.enum(["room_date", "room_type", "rate_plan", "rate_plan_room_type"]),
  rate_plan_id: z.string().uuid().nullable().default(null),
  room_type_id: z.string().uuid().nullable().default(null),
  room_id: z.string().uuid().nullable().default(null),
  effective_from: z.string().date(),
  effective_to: z.string().date(),
  nightly_rate: z.number().finite().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  reason: z.string().trim().min(5).max(500),
  status: z.enum(["pending", "approved", "rejected", "revoked"]).default("pending"),
}).superRefine((value, context) => {
  if (value.effective_to < value.effective_from) {
    context.addIssue({ code: "custom", path: ["effective_to"], message: "End date must be on or after start date." });
  }
  const validShape =
    (value.scope === "room_date" && !!value.room_id && !value.room_type_id && !value.rate_plan_id && value.effective_from === value.effective_to) ||
    (value.scope === "room_type" && !!value.room_type_id && !value.room_id && !value.rate_plan_id) ||
    (value.scope === "rate_plan" && !!value.rate_plan_id && !value.room_type_id && !value.room_id) ||
    (value.scope === "rate_plan_room_type" && !!value.rate_plan_id && !!value.room_type_id && !value.room_id);
  if (!validShape) {
    context.addIssue({ code: "custom", path: ["scope"], message: "Override scope and target identifiers do not match." });
  }
});

export type RateOverrideInput = z.infer<typeof rateOverrideSchema>;

export type ExistingRateOverride = Pick<
  RateOverrideInput,
  "scope" | "rate_plan_id" | "room_type_id" | "room_id" | "effective_from" | "effective_to" | "status"
>;

export function conflictsWithApprovedOverride(
  candidate: ExistingRateOverride,
  existing: ExistingRateOverride,
): boolean {
  if (existing.status !== "approved" || candidate.status !== "approved") return false;
  if (
    candidate.scope !== existing.scope ||
    candidate.rate_plan_id !== existing.rate_plan_id ||
    candidate.room_type_id !== existing.room_type_id ||
    candidate.room_id !== existing.room_id
  ) return false;
  return candidate.effective_from <= existing.effective_to &&
    existing.effective_from <= candidate.effective_to;
}

export function assertNoApprovedOverrideConflict(
  candidate: ExistingRateOverride,
  existing: ExistingRateOverride[],
): void {
  if (existing.some((row) => conflictsWithApprovedOverride(candidate, row))) {
    throw new Error("An approved rate override already covers part of this effective period.");
  }
}
