import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listEventsSchema, recordEventSchema } from "../core/contracts";

export const recordIntelligenceEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordEventSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./events.server");
    return mod.recordEvent(context.supabase, context.userId, data);
  });

export const listIntelligenceEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listEventsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./events.server");
    return mod.listEvents(context.supabase, context.userId, data);
  });