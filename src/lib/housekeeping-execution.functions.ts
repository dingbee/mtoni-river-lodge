import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: rows, error } = await context.supabase.rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_claim_task", {
      _task_id: data.taskId,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const startHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_start_task", {
      _task_id: data.taskId,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const completeHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    taskId,
    note: z.string().max(500).optional(),
    idempotencyKey,
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_complete_task", {
      _task_id: data.taskId,
      _note: data.note ?? null,
      _idempotency_key: data.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const listHousekeepingStaff = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data, error } = await context.supabase.rpc("housekeeping_list_staff");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const assignHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    taskId,
    assigneeId: z.string().uuid(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_assign_task", {
      _task_id: data.taskId,
      _assignee_id: data.assigneeId,
    });
    if (error) throw new Error(error.message);
    return row;
  });
