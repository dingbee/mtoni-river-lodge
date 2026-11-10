import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const dispatchSchema = z.object({
  request_id: z.string().uuid(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_at: z.string().datetime().nullable().optional(),
});

export const dispatchGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dispatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: propertyId, error: propertyError } = await db.rpc("staynas_active_property_id", {
      _uid: context.userId,
    });
    if (propertyError || !propertyId)
      throw new Error("Select an active property before dispatching guest requests.");

    const { data: hasAccess, error: accessError } = await db.rpc(
      "staynas_user_has_property_access",
      { _uid: context.userId, _property_id: propertyId },
    );
    if (accessError || !hasAccess) throw new Error("Active property access denied.");

    const { data: request, error: requestError } = await db
      .from("staynas_guest_requests")
      .select("id, category")
      .eq("id", data.request_id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (requestError || !request)
      throw new Error("Guest request not found in the active property.");

    if (request.category === "housekeeping") {
      await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
      const { data: result, error } = await db.rpc("staynas_dispatch_housekeeping_request", {
        _request_id: data.request_id,
      });
      if (error) throw new Error(error.message);
      const row = Array.isArray(result) ? result[0] : result;
      if (!row?.task_id) throw new Error("HK-X did not confirm the housekeeping task.");
      return { ...row, task_category: "housekeeping" };
    }

    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.concierge");
    const { data: result, error } = await db.rpc("staynas_dispatch_guest_request", {
      _request_id: data.request_id,
      _assignee_id: data.assignee_id ?? null,
      _due_at: data.due_at ?? null,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.task_id) throw new Error("Operational task was not created.");
    return row;
  });
