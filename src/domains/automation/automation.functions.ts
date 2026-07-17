import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Automation & Workflow Engine — server functions.
 * Runs workflows in response to platform events, manages notifications,
 * scheduled jobs and approval requests.
 */

const workflowInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(140),
  description: z.string().max(500).optional().nullable(),
  trigger_event: z.string().min(1).max(80),
  conditions: z.array(z.any()).default([]),
  actions: z.array(z.any()).default([]),
  enabled: z.boolean().default(true),
  requires_approval: z.boolean().default(false),
  approver_roles: z.array(z.string()).default([]),
  is_template: z.boolean().optional(),
});

export const listWorkflows = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("workflows")
      .select("*")
      .order("is_template", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getWorkflow = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("workflows").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => workflowInput.parse(i))
  .handler(async ({ data, context }) => {
    const row: any = {
      name: data.name,
      description: data.description ?? null,
      trigger_event: data.trigger_event,
      conditions: data.conditions,
      actions: data.actions,
      enabled: data.enabled,
      requires_approval: data.requires_approval,
      approver_roles: data.approver_roles,
      is_template: data.is_template ?? false,
    };
    if (data.id) {
      const { error } = await context.supabase.from("workflows").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    row.created_by = context.userId;
    const { data: inserted, error } = await context.supabase.from("workflows").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("workflows").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cloneWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: src, error } = await context.supabase.from("workflows").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const copy: any = { ...src, name: `${src.name} (copy)`, is_template: false, created_by: context.userId };
    delete copy.id; delete copy.created_at; delete copy.updated_at;
    const { data: inserted, error: e2 } = await context.supabase.from("workflows").insert(copy).select("id").single();
    if (e2) throw new Error(e2.message);
    return { id: inserted.id };
  });

// ---------- Runs / monitor ----------

export const listWorkflowRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: z.string().optional(), limit: z.number().max(200).default(80) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("workflow_runs")
      .select("*, workflow:workflows(id,name)")
      .order("started_at", { ascending: false })
      .limit(data.limit);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getRunSteps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("workflow_run_steps").select("*").eq("run_id", data.runId).order("step_index");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const retryWorkflowRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ runId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: run } = await context.supabase.from("workflow_runs").select("*").eq("id", data.runId).single();
    if (!run) throw new Error("Run not found");
    await dispatchWorkflow(context.supabase, run.workflow_id, run.trigger_event, run.event_payload, {
      correlationId: run.correlation_id, retryOf: run.id,
    });
    return { ok: true };
  });

// ---------- Dispatch engine ----------

function evalCondition(cond: any, payload: any): boolean {
  try {
    const field = String(cond.field ?? "");
    const op = String(cond.op ?? "eq");
    const target = cond.value;
    const value = field.split(".").reduce((acc: any, k: string) => (acc == null ? acc : acc[k]), payload);
    switch (op) {
      case "eq": return value === target;
      case "neq": return value !== target;
      case "gt": return Number(value) > Number(target);
      case "gte": return Number(value) >= Number(target);
      case "lt": return Number(value) < Number(target);
      case "lte": return Number(value) <= Number(target);
      case "in": return Array.isArray(target) && target.includes(value);
      case "contains": return typeof value === "string" && value.includes(String(target));
      case "exists": return value != null;
      default: return false;
    }
  } catch { return false; }
}

function evalConditions(conditions: any[], payload: any, mode: "all" | "any" = "all"): boolean {
  if (!conditions?.length) return true;
  return mode === "all" ? conditions.every((c) => evalCondition(c, payload))
                         : conditions.some((c) => evalCondition(c, payload));
}

async function executeAction(supabase: any, runId: string, index: number, action: any, payload: any) {
  const step = { run_id: runId, step_index: index, step_type: action.type, step_config: action, status: "running" };
  const { data: inserted } = await supabase.from("workflow_run_steps").insert(step).select("id").single();
  const stepId = inserted?.id;
  try {
    let result: any = { simulated: true };
    switch (action.type) {
      case "send_email":
      case "send_whatsapp":
      case "send_sms":
      case "notify_staff": {
        // Persist a notification record (channels handled by delivery workers)
        await supabase.from("notifications").insert({
          channel: action.type === "notify_staff" ? "in_app" : action.type.replace("send_", ""),
          role: action.role ?? null,
          title: action.title ?? action.template ?? action.type,
          body: action.body ?? null,
          kind: action.template ?? action.type,
          meta: { action, event: payload },
        });
        result = { ok: true };
        break;
      }
      case "create_task": {
        if (payload.entityType === "booking" && payload.entityId) {
          await supabase.from("ops_tasks").insert({
            booking_id: payload.entityId,
            task_type: action.task_type ?? "workflow",
            title: action.title ?? "Workflow task",
            description: action.description ?? null,
            priority: action.priority ?? 2,
          });
        }
        result = { ok: true };
        break;
      }
      case "add_note": {
        result = { note: action.text ?? "" };
        break;
      }
      case "update_tag":
      case "change_status":
      case "generate_invoice":
      case "assign_housekeeping":
      case "schedule_followup": {
        result = { queued: true, action };
        break;
      }
      default:
        result = { skipped: true };
    }
    await supabase.from("workflow_run_steps").update({ status: "succeeded", result, finished_at: new Date().toISOString() }).eq("id", stepId);
    return { ok: true, result };
  } catch (err) {
    const msg = (err as Error).message;
    await supabase.from("workflow_run_steps").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", stepId);
    return { ok: false, error: msg };
  }
}

async function dispatchWorkflow(
  supabase: any,
  workflowId: string,
  eventType: string,
  payload: any,
  opts: { correlationId?: string | null; retryOf?: string | null } = {},
) {
  const { data: wf } = await supabase.from("workflows").select("*").eq("id", workflowId).single();
  if (!wf || !wf.enabled) return;

  const conditionsMet = evalConditions(wf.conditions ?? [], payload);
  const status = wf.requires_approval ? "awaiting_approval" : (conditionsMet ? "running" : "succeeded");
  const { data: run } = await supabase.from("workflow_runs").insert({
    workflow_id: workflowId,
    trigger_event: eventType,
    event_payload: payload,
    status,
    conditions_met: conditionsMet,
    correlation_id: opts.correlationId ?? null,
    retry_count: opts.retryOf ? 1 : 0,
  }).select("id").single();

  if (!run) return;

  if (wf.requires_approval) {
    await supabase.from("approval_requests").insert({
      workflow_run_id: run.id,
      approver_roles: wf.approver_roles ?? [],
      approval_kind: "custom",
      subject: `Approve: ${wf.name}`,
      details: { event: eventType, payload },
    });
    return;
  }

  if (!conditionsMet) {
    await supabase.from("workflow_runs").update({ finished_at: new Date().toISOString() }).eq("id", run.id);
    return;
  }

  let failed = false;
  const actions = Array.isArray(wf.actions) ? wf.actions : [];
  for (let i = 0; i < actions.length; i++) {
    const res = await executeAction(supabase, run.id, i, actions[i], payload);
    if (!res.ok) { failed = true; break; }
  }

  await supabase.from("workflow_runs").update({
    status: failed ? "failed" : "succeeded",
    error: failed ? "One or more steps failed" : null,
    finished_at: new Date().toISOString(),
  }).eq("id", run.id);
}

/** Fan out an event to every enabled workflow whose trigger matches. */
export const dispatchEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    type: z.string(),
    module: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().uuid().optional().nullable(),
    meta: z.record(z.string(), z.unknown()).optional(),
    correlationId: z.string().uuid().optional().nullable(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: matches } = await context.supabase
      .from("workflows")
      .select("id")
      .eq("trigger_event", data.type)
      .eq("enabled", true)
      .eq("is_template", false);
    if (!matches?.length) return { dispatched: 0 };
    for (const m of matches) {
      try { await dispatchWorkflow(context.supabase, m.id, data.type, data, { correlationId: data.correlationId }); }
      catch (err) { console.warn("[automation] dispatch failed", (err as Error).message); }
    }
    return { dispatched: matches.length };
  });

// ---------- Notifications ----------

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications").select("*")
      .or(`user_id.eq.${context.userId},user_id.is.null`)
      .order("created_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Scheduled jobs ----------

export const listScheduledJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("scheduled_jobs").select("*").order("name");
    return data ?? [];
  });

export const saveScheduledJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid().optional(),
    name: z.string().min(1),
    description: z.string().optional().nullable(),
    cron_expression: z.string().min(1),
    job_type: z.string().min(1),
    enabled: z.boolean().default(true),
  }).parse(i))
  .handler(async ({ data, context }) => {
    if (data.id) {
      await context.supabase.from("scheduled_jobs").update(data).eq("id", data.id);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase.from("scheduled_jobs").insert(data).select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const toggleScheduledJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    await context.supabase.from("scheduled_jobs").update({ enabled: data.enabled }).eq("id", data.id);
    return { ok: true };
  });

// ---------- Approvals ----------

export const listApprovals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ status: z.string().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("approval_requests").select("*").order("created_at", { ascending: false }).limit(100);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const decideApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().max(500).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: appr } = await context.supabase.from("approval_requests").select("*").eq("id", data.id).single();
    if (!appr) throw new Error("Approval not found");
    await context.supabase.from("approval_requests").update({
      status: data.decision,
      decided_by: context.userId,
      decided_at: new Date().toISOString(),
      decision_reason: data.reason ?? null,
    }).eq("id", data.id);
    // If approved and tied to a workflow run, resume execution
    if (data.decision === "approved" && appr.workflow_run_id) {
      const { data: run } = await context.supabase.from("workflow_runs").select("*").eq("id", appr.workflow_run_id).single();
      if (run) {
        await context.supabase.from("workflow_runs").update({ status: "running" }).eq("id", run.id);
        const { data: wf } = await context.supabase.from("workflows").select("*").eq("id", run.workflow_id).single();
        const actions = Array.isArray(wf?.actions) ? wf!.actions : [];
        let failed = false;
        for (let i = 0; i < actions.length; i++) {
          const res = await executeAction(context.supabase, run.id, i, actions[i], run.event_payload);
          if (!res.ok) { failed = true; break; }
        }
        await context.supabase.from("workflow_runs").update({
          status: failed ? "failed" : "succeeded",
          finished_at: new Date().toISOString(),
        }).eq("id", run.id);
      }
    } else if (data.decision === "rejected" && appr.workflow_run_id) {
      await context.supabase.from("workflow_runs").update({
        status: "cancelled", finished_at: new Date().toISOString(),
      }).eq("id", appr.workflow_run_id);
    }
    return { ok: true };
  });

export const requestApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    approval_kind: z.string(),
    subject: z.string().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
    approver_roles: z.array(z.string()).default(["owner","manager","admin"]),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("approval_requests").insert({
      approval_kind: data.approval_kind,
      subject: data.subject,
      details: data.details ?? {},
      approver_roles: data.approver_roles,
      requested_by: context.userId,
    }).select("id").single();
    if (error) throw new Error(error.message);
    return { id: row.id };
  });