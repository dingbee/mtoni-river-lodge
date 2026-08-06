import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { arrivalBriefingSchema } from "./arrival-intelligence-shared";
import { arrivalDetailSchema } from "./arrivals-shared";

export const getArrivalBriefing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => arrivalBriefingSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrival-intelligence.server");
    return mod.getArrivalBriefing(context.supabase, context.userId, data);
  });

export const getArrivalTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => arrivalDetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrival-intelligence.server");
    return mod.getArrivalTimeline(context.supabase, context.userId, data.bookingId);
  });
