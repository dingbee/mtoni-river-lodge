import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listPredictionsSchema, recordPredictionSchema, scorePredictionSchema } from "../core/contracts";

export const recordIntelligencePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordPredictionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./predictions.server");
    return mod.recordPrediction(context.supabase, context.userId, data);
  });

export const listIntelligencePredictions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listPredictionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./predictions.server");
    return mod.listPredictions(context.supabase, context.userId, data);
  });

export const scoreIntelligencePrediction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scorePredictionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./predictions.server");
    return mod.scorePrediction(context.supabase, context.userId, data);
  });