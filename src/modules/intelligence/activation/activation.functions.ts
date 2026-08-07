import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ingestSchema = z.object({
  eventId: z.string().min(1).max(120),
  type: z.string().min(2).max(120),
  entityType: z.string().max(60).nullish(),
  entityId: z.string().uuid().nullish(),
  meta: z.record(z.string(), z.unknown()).default({}),
  occurredAt: z.string().nullish(),
});

const pipelineSchema = z.object({
  module: z.string().max(40).optional(),
  windowHours: z.number().int().min(1).max(168).default(24),
});

const timelineSchema = z.object({
  module: z.string().max(40).optional(),
  stage: z.enum(["observe", "understand", "reason", "recommend", "act", "learn"]).optional(),
  limit: z.number().int().min(1).max(200).default(60),
});

const healthSchema = z.object({ windowDays: z.number().int().min(1).max(180).default(30) });

export const ingestPlatformIntelligenceEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ingestSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./activation.server");
    return mod.ingestPlatformEvent(context.supabase, context.userId, data);
  });

export const runIntelligencePipeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pipelineSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./activation.server");
    return mod.runPipeline(context.supabase, context.userId, data);
  });

export const getIntelligenceTimelineFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => timelineSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("../timeline/timeline.server");
    return mod.getIntelligenceTimeline(context.supabase, context.userId, data);
  });

export const getIntelligenceHealthFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => healthSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("../observability/health.server");
    return mod.getIntelligenceHealth(context.supabase, context.userId, data.windowDays);
  });