import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const roomStateId = z.string().uuid();
const taskId = z.string().uuid().nullable().optional();

export const reportHousekeepingException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    roomStateId, taskId, exceptionType: z.enum(["dnd","discrepancy","damage","maintenance","lost_found","linen_amenity"]),
    title: z.string().trim().min(2).max(200),
    notes: z.string().max(2000).optional(),
    severity: z.number().int().min(1).max(3).default(2),
    evidence: z.array(z.unknown()).max(20).default([]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_report_exception", {
      _room_state_id: data.roomStateId,
      _task_id: data.taskId ?? null,
      _exception_type: data.exceptionType,
      _title: data.title,
      _notes: data.notes ?? null,
      _severity: data.severity,
      _evidence: data.evidence,
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const listHousekeepingExceptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ roomStateId: roomStateId.optional(), openOnly: z.boolean().default(true) }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: rows, error } = await context.supabase.rpc("housekeeping_list_exceptions", {
      _room_state_id: data.roomStateId ?? null, _open_only: data.openOnly,
    });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const resolveHousekeepingException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ exceptionId: z.string().uuid(), resolution: z.string().max(2000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: row, error } = await context.supabase.rpc("housekeeping_resolve_exception", {
      _exception_id: data.exceptionId, _resolution: data.resolution ?? null,
    });
    if (error) throw new Error(error.message);
    return row;
  });
