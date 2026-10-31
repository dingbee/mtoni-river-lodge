import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_start_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_start_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_complete_task", {
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
    const { data, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_staff");
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_start_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
import { housekeepingClient } from "@/lib/housekeeping-rpc";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const taskId = z.string().uuid();
const idempotencyKey = z.string().min(8).max(200);

async function activePropertyId(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !data) throw new Error("Active property context is required.");
  const { data: allowed, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: data },
  );
  if (accessError || !allowed) throw new Error("Active property access denied.");
  return data as string;
}

async function assertHousekeepingTaskProperty(supabase: any, taskId: string, propertyId: string) {
  const { data, error } = await supabase.from("ops_tasks").select("id")
    .eq("id", taskId).eq("property_id", propertyId)
    .eq("category", "housekeeping").maybeSingle();
  if (error || !data) throw new Error("Housekeeping task is not part of the active property.");
}

export const listHousekeepingWork = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    mineOnly: z.boolean().default(false),
    includeCompleted: z.boolean().default(false),
  }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_work", {
      _mine_only: data.mineOnly,
      _include_completed: data.includeCompleted,
    });
    if (error) throw new Error(error.message);
    const taskIds = (rows ?? []).map((row: any) => row.id).filter(Boolean);
    if (!taskIds.length) return [];
    const { data: scopedTasks, error: scopeError } = await context.supabase.from("ops_tasks")
      .select("id").eq("property_id", propertyId).eq("category", "housekeeping").in("id", taskIds);
    if (scopeError) throw new Error(scopeError.message);
    const allowedIds = new Set((scopedTasks ?? []).map((row: any) => row.id));
    return (rows ?? []).filter((row: any) => allowedIds.has(row.id));
  });

export const claimHousekeepingTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ taskId, idempotencyKey }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "housekeeping");
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_claim_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_start_task", {
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_complete_task", {
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
    const { data, error } = await housekeepingClient(context.supabase).rpc("housekeeping_list_staff");
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
    const propertyId = await activePropertyId(context.supabase, context.userId);
    await assertHousekeepingTaskProperty(context.supabase, data.taskId, propertyId);
    const { data: row, error } = await housekeepingClient(context.supabase).rpc("housekeeping_assign_task", {
      _task_id: data.taskId,
      _assignee_id: data.assigneeId,
    });
    if (error) throw new Error(error.message);
    return row;
  });
