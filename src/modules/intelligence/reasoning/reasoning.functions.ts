import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  decideInsightSchema,
  listInsightsSchema,
  listSignalsSchema,
  recordInsightSchema,
  recordSignalSchema,
} from "../core/contracts";

export const recordIntelligenceSignal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordSignalSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./reasoning.server");
    return mod.recordSignal(context.supabase, context.userId, data);
  });

export const listIntelligenceSignals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSignalsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./reasoning.server");
    return mod.listSignals(context.supabase, context.userId, data);
  });

export const recordIntelligenceInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordInsightSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./reasoning.server");
    return mod.recordInsight(context.supabase, context.userId, data);
  });

export const listIntelligenceInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInsightsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./reasoning.server");
    return mod.listInsights(context.supabase, context.userId, data);
  });

export const decideIntelligenceInsight = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => decideInsightSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./reasoning.server");
    return mod.decideInsight(context.supabase, context.userId, data);
  });