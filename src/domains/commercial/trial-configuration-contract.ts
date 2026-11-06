import { z } from "zod";
import { COMMERCIAL_PLAN_CODES } from "./catalogue-contract";

/**
 * CC02.04 defines trial policy only. Customer-specific trial lifecycle,
 * subscription conversion, billing and entitlement changes belong to CC-03+.
 */
export const COMMERCIAL_TRIAL_DURATION_DAYS = 14 as const;
export const COMMERCIAL_TRIAL_START_TRIGGERS = ["subscription_activated"] as const;

const isoDate = z.string().date();

export const commercialTrialPolicySchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  policyVersion: z.number().int().positive(),
  enabled: z.boolean(),
  durationDays: z.literal(COMMERCIAL_TRIAL_DURATION_DAYS),
  startTrigger: z.enum(COMMERCIAL_TRIAL_START_TRIGGERS),
  effectiveFrom: isoDate.nullable(),
  effectiveTo: isoDate.nullable(),
}).superRefine((value, ctx) => {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["effectiveTo"],
      message: "Effective end date must not precede effective start date",
    });
  }
});
export type CommercialTrialPolicy = z.infer<typeof commercialTrialPolicySchema>;

export const commercialTrialPolicyResolutionInputSchema = z.object({
  planCode: z.enum(COMMERCIAL_PLAN_CODES),
  planVersion: z.number().int().positive(),
  asOf: isoDate,
});
export type CommercialTrialPolicyResolutionInput = z.infer<typeof commercialTrialPolicyResolutionInputSchema>;

export interface CommercialTrialWindow {
  policyVersion: number;
  planCode: CommercialTrialPolicy["planCode"];
  planVersion: number;
  durationDays: typeof COMMERCIAL_TRIAL_DURATION_DAYS;
  startedAt: string;
  endsAt: string;
  endBoundary: "exclusive";
}

/**
 * Trial end is an exclusive UTC instant exactly 14 × 24 hours after activation.
 * This helper calculates a window; it does not activate a subscription or
 * create a billing/entitlement event.
 */
export function createCommercialTrialWindow(
  policy: CommercialTrialPolicy,
  activatedAt: string,
): CommercialTrialWindow {
  const parsedPolicy = commercialTrialPolicySchema.parse(policy);
  if (!parsedPolicy.enabled) {
    throw new Error("Commercial trial policy is disabled");
  }

  const startMilliseconds = Date.parse(activatedAt);
  if (!Number.isFinite(startMilliseconds) || !/^\d{4}-\d{2}-\d{2}T/.test(activatedAt)) {
    throw new Error("Trial activation timestamp must be a valid ISO-8601 date-time");
  }

  const activationDate = new Date(startMilliseconds).toISOString().slice(0, 10);
  if (parsedPolicy.effectiveFrom && activationDate < parsedPolicy.effectiveFrom) {
    throw new Error("Commercial trial policy is not yet effective");
  }
  if (parsedPolicy.effectiveTo && activationDate > parsedPolicy.effectiveTo) {
    throw new Error("Commercial trial policy has expired");
  }

  const endMilliseconds = startMilliseconds + COMMERCIAL_TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000;
  return {
    policyVersion: parsedPolicy.policyVersion,
    planCode: parsedPolicy.planCode,
    planVersion: parsedPolicy.planVersion,
    durationDays: COMMERCIAL_TRIAL_DURATION_DAYS,
    startedAt: new Date(startMilliseconds).toISOString(),
    endsAt: new Date(endMilliseconds).toISOString(),
    endBoundary: "exclusive",
  };
}
