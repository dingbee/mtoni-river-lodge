import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recallSchema, rememberSchema, reviewMemorySchema, submitFeedbackSchema } from "../core/contracts";

export const rememberIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rememberSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./memory.server");
    return mod.remember(context.supabase, context.userId, data);
  });

export const recallIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recallSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./memory.server");
    return mod.recall(context.supabase, context.userId, data);
  });

export const reviewIntelligenceMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewMemorySchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./memory.server");
    return mod.reviewMemory(context.supabase, context.userId, data);
  });

export const submitIntelligenceFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => submitFeedbackSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./memory.server");
    return mod.submitFeedback(context.supabase, context.userId, data);
  });