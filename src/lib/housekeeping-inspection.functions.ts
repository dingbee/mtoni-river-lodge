import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const inspectionId = z.string().uuid();

export const listHousekeepingInspectionQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data, error } = await context.supabase.rpc("housekeeping_list_inspection_queue");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitHousekeepingInspection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    inspectionId,
    passed: z.boolean(),
    checklist: z.array(z.object({
      key: z.string(),
      passed: z.boolean(),
    })).length(8),
    notes: z.string().max(1000).optional(),
    idempotencyKey: z.string().min(8).max(200),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_submit_inspection", {
      _inspection_id: data.inspectionId,
      _checklist: data.checklist,
      _passed: data.passed,
      _notes: data.notes ?? null,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return row;
  });
