import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";
import { provisionFounderSubscriptionRequest } from "./founder-control-centre.functions";
import {
  commercialAddonSchema,
  commercialPlanSchema,
  commercialPlanVersionSchema,
  type CommercialAddon,
} from "./catalogue-contract";
import {
  commercialAddonPriceSchema,
  commercialPlanPriceSchema,
  type CommercialAddonPrice,
  type CommercialPlanPrice,
} from "./pricing-contract";

export const subscriptionChangeRequestInputSchema = z
  .object({
    subscriptionId: z.string().uuid().nullable().optional(),
    requestType: z.enum([
      "subscribe",
      "add_addon",
      "remove_addon",
      "upgrade",
      "downgrade",
      "cancel",
    ]),
    planCode: z.enum(["essential", "professional", "enterprise"]).nullable().optional(),
    planVersion: z.number().int().positive().nullable().optional(),
    addonCodes: z.array(z.string().trim().min(2).max(60)).max(30).default([]),
    currency: z.enum(["TZS", "USD"]).nullable().optional(),
    billingTerm: z.enum(["monthly", "annual"]).nullable().optional(),
    propertyCount: z.number().int().positive().nullable().optional(),
    reason: z.string().trim().min(3).max(1000),
    idempotencyKey: z.string().trim().min(8).max(200),
  })
  .superRefine((value, ctx) => {
 ¶»§q«^