import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { requireStayNasCoreStaffAccess } from "@/lib/staynas-authorization.server";

export type ActivityLogEntry = {
  id: string;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  metadata: Json;
  previous_value: Json | null;
  new_value: Json | null;
  ip_address: string | null;
  user_agent: string | null;
  module: string | null;
  severity: string;
  correlation_id: string | null;
  created_at: string;
};

async function assertStaff(supabase: any, userId: string) {
  await requireStayNasCoreStaffAccess(supabase, userId);
}

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  action: z.string().max(80).optional(),
  actorEmail: z.string().email().max(200).optional(),
  from: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  to: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/).optional(),
  limit: z.number().int().min(1).max(1000).default(300),
}).refine((v) => !v.from || !v.to || v.from <= v.to, {
  message: "The start date must not be after the end date",
});

const DAR_ES_SALAAM_OFFSET = "+03:00";

export const listActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    let q = context.supabase
      .from("activity_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.action) q = q.eq("action", data.action);
    if (data.actorEmail) q = q.eq("actor_email", data.actorEmail);
    if (data.from) {
      q = q.gte("created_at", new Date(`${data.from}T00:00:00${DAR_ES_SALAAM_OFFSET}`).toISOString());
    }
    if (data.to) {
      const endExclusive = new Date(`${data.to}T00:00:00${DAR_ES_SALAAM_OFFSET}`);
      endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
      q = q.lt("created_at", endExclusive.toISOString());
    }
    if (data.search) {
      // Keep PostgREST's .or() expression syntax safe; treat wildcard and
      // delimiter characters as ordinary search text rather than operators.
      const term = data.search.replace(/[%,()_*\\\\]/g, " ").trim();
      if (term) {
        const s = `%${term}%`;
        q = q.or(`entity_label.ilike.${s},action.ilike.${s},actor_email.ilike.${s}`);
      }
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
