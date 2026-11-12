import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  module: z.string().max(80).optional(),
}).default({});

export const listMyOperationalNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listInput.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    let query = db
      .from("operational_notification_deliveries")
      .select("id,status,channel,assigned_at,assigned_by,read_at,acknowledged_at,resolved_at,created_at,event:operational_notification_events!inner(id,event_type,module,entity_type,entity_id,severity,title,body,href,property_id,organisation_id,correlation_id,occurred_at)")
      .eq("recipient_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.module) query = query.eq("event.module", data.module);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const transitionOperationalNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    deliveryId: z.string().uuid(),
    action: z.enum(["read", "acknowledge", "resolve"]),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as any;
    const { data: row, error } = await db.rpc(
      "staynas_operational_notification_transition",
      { _delivery_id: data.deliveryId, _action: data.action },
    );
    if (error) throw new Error(error.message);
    return row;
  });
