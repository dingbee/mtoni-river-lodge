import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const executionSchema = z.object({
  task_id: z.string().uuid(),
  action: z.enum(["assign", "accept", "start", "complete", "note"]),
  assignee_id: z.string().uuid().nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const updateGuestTaskExecution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => executionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "staynas_update_guest_task_execution",
      {
        _task_id: data.task_id,
        _action: data.action,
        _assignee_id: data.assignee_id ?? null,
        _note: data.note ?? null,
      },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.task_id) throw new Error("Task execution update was not confirmed.");
    return row;
  });

const requestStatusSchema = z.object({
  request_id: z.string().uuid(),
  status: z.enum(["received", "triaged", "assigned", "in_progress", "fulfilled", "cancelled", "escalated"]),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const updateGuestRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "staynas_update_guest_request_status",
      { _request_id: data.request_id, _status: data.status, _note: data.note ?? null },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.request_id) throw new Error("Guest request status update was not confirmed.");
    return row;
  });
