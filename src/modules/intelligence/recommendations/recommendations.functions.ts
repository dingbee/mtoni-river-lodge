import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decideRecommendationSchema,
  listRecommendationsSchema,
  recordRecommendationSchema,
} from "../core/contracts";

export const recordIntelligenceRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordRecommendationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./recommendations.server");
    return mod.recordRecommendation(context.supabase, context.userId, data);
  });

export const listIntelligenceRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRecommendationsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./recommendations.server");
    return mod.listRecommendations(context.supabase, context.userId, data);
  });

export const decideIntelligenceRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideRecommendationSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./recommendations.server");
    return mod.decideRecommendation(context.supabase, context.userId, data);
  });