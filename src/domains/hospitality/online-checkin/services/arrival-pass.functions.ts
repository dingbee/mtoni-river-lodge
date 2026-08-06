/**
 * QR Arrival Pass — staff server functions.
 * Validation and arrival confirmation run through the existing database
 * services (`arrival_pass_validate` / `arrival_pass_confirm`), which reuse
 * `checkin_eligibility` and `checkin_sync_reservation` for all reservation,
 * allocation and calendar logic.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scanInputSchema } from "./arrival-pass-shared";

export const validateArrivalPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrival-pass.server");
    return mod.validatePass(context.supabase, context.userId, data);
  });

export const confirmArrivalPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scanInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./arrival-pass.server");
    return mod.confirmPass(context.supabase, context.userId, data);
  });