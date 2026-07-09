import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ActivityLogEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Record<string, unknown>;
  previous_value: unknown;
  new_value: unknown;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const listSchema = z.object({
  search: z.string().max(200).optional(),
  action: z.string().max(80).optional(),
  actorEmail: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.number().int().min(1).max(1000).default(300),
});

export const listActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }): Promise<ActivityLogEntry[]> => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.action) q = q.eq("action", data.action);
    if (data.actorEmail) q = q.eq("actor_email", data.actorEmail);
    if (data.from) q = q.gte("created_at", new Date(data.from).toISOString());
    if (data.to) q = q.lte("created_at", new Date(data.to + "T23:59:59Z").toISOString());
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`entity_label.ilike.${s},action.ilike.${s},actor_email.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as ActivityLogEntry[];
  });

export const listActivityActors = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("activity_logs")
      .select("actor_email")
      .not("actor_email", "is", null)
      .order("actor_email")
      .limit(500);
    if (error) throw new Error(error.message);
    const unique = Array.from(new Set((data ?? []).map((r: any) => r.actor_email))).filter(Boolean);
    return unique as string[];
  });