import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dispatchSchema = z.object({
  request_id: z.string().uuid(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
});

export const dispatchGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dispatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "staynas_dispatch_guest_request",
      {
        _request_id: data.request_id,
        _assignee_id: data.assignee_id ?? null,
        _due_at: data.due_at ?? null,
      },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.task_id) throw new Error("Operational task was not created.");
    return row;
  });
