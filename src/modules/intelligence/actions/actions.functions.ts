import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listActionsSchema, proposeActionSchema, transitionActionSchema } from "../core/contracts";

export const proposeIntelligenceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => proposeActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./actions.server");
    return mod.proposeAction(context.supabase, context.userId, data);
  });

export const listIntelligenceActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listActionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./actions.server");
    return mod.listActions(context.supabase, context.userId, data);
  });

export const transitionIntelligenceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => transitionActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./actions.server");
    return mod.transitionAction(context.supabase, context.userId, data);
  });