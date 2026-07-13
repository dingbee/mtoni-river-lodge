import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const TASK_STATUS = ["pending", "in_progress", "completed", "cancelled"] as const;

export const listOpsTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    status: z.enum(["all", ...TASK_STATUS]).default("all"),
    category: z.string().optional(),
    mine: z.boolean().optional().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    let q = sb.from("ops_tasks")
      .select("*, booking:bookings(id, reference, guest_name, check_in, check_out)")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.category) q = q.eq("category", data.category);
    if (data.mine) q = q.eq("assignee_id", context.userId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const createSchema = z.object({
  bookingId: z.string().uuid().nullable().optional(),
  taskType: z.string().min(1).max(60),
  category: z.enum(["housekeeping","concierge","maintenance","transport","fnb","other"]).default("other"),
  title: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(1).max(3).default(2),
  dueAt: z.string().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
});

export const createOpsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { data: row, error } = await sb.from("ops_tasks").insert({
      booking_id: data.bookingId ?? null,
      task_type: data.taskType,
      category: data.category,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      due_at: data.dueAt ?? null,
      assignee_id: data.assigneeId ?? null,
      status: "pending",
    }).select().single();
    if (error) throw new Error(error.message);
    return row;
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(TASK_STATUS).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(1000).optional(),
  priority: z.number().int().min(1).max(3).optional(),
  dueAt: z.string().nullable().optional(),
});

export const updateOpsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const patch: any = {};
    if (data.status) {
      patch.status = data.status;
      if (data.status === "completed") patch.completed_at = new Date().toISOString();
    }
    if (data.assigneeId !== undefined) patch.assignee_id = data.assigneeId;
    if (data.title !== undefined) patch.title = data.title;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priority !== undefined) patch.priority = data.priority;
    if (data.dueAt !== undefined) patch.due_at = data.dueAt;
    const { error } = await sb.from("ops_tasks").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeOpsTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const { error } = await sb.from("ops_tasks")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });