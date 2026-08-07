import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  executeActionSchema,
  governActionSchema,
  listActionBoardSchema,
  measureOutcomesSchema,
  outcomeBoardSchema,
  prepareActionsSchema,
  verifyActionSchema,
} from "./orchestration.types";

export const prepareIntelligenceActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => prepareActionsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.prepareActions(context.supabase, context.userId, data);
  });

export const getIntelligenceActionBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listActionBoardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.getActionBoard(context.supabase, context.userId, data);
  });

export const governIntelligenceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => governActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.governAction(context.supabase, context.userId, data);
  });

export const executeIntelligenceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => executeActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.executeAction(context.supabase, context.userId, data);
  });

export const verifyIntelligenceAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => verifyActionSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.verifyAction(context.supabase, context.userId, data);
  });

export const measureIntelligenceOutcomes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => measureOutcomesSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.measureOutcomes(context.supabase, context.userId, data);
  });

export const getIntelligenceOutcomeBoard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => outcomeBoardSchema.parse(d))
  .handler(async ({ data, context }) => {
    const mod = await import("./orchestration.server");
    return mod.getOutcomeBoard(context.supabase, context.userId, data);
  });