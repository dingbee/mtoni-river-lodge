import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const requestId = z.string().uuid();

export const dispatchGuestHousekeepingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId }).parse(input))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const { data: result, error } = await context.supabase.rpc(
      "staynas_dispatch_housekeeping_request",
      { _request_id: data.requestId },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.task_id || !row?.request_id) {
      throw new Error("Housekeeping dispatch was not confirmed.");
    }
    return row;
  });
