import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  arrivalDetailSchema,
  arrivalsFilterSchema,
  reviewCheckInSchema,
  staffNoteSchema,
} from "./arrivals-shared";

export const listStaffArrivals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => arrivalsFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrivals.server");
    return mod.listArrivals(context.supabase, context.userId, data);
  });

export const getStaffArrivalDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => arrivalDetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrivals.server");
    return mod.getArrivalDetail(context.supabase, context.userId, data.bookingId);
  });

export const reviewStaffCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewCheckInSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrivals.server");
    return mod.reviewCheckIn(context.supabase, context.userId, context.claims, data);
  });

export const addArrivalStaffNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => staffNoteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrivals.server");
    return mod.addStaffNote(context.supabase, context.userId, context.claims, data);
  });
