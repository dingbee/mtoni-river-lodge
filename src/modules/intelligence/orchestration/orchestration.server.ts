/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Sprint 6 — Action Orchestration & Closed-Loop Intelligence (persistence).
 *
 * Turns approved decisions into governed, idempotent, verifiable actions:
 * prepare → approve → execute (via a module adapter) → verify → measure → learn.
 * The core still never writes operational data directly; adapters do, and only
 * with capabilities their module has declared.
 */
import { assertIntelDecide, assertIntelRead, rolesFor, visibleModules } from "../core/access.server";
import { getBusinessContext } from "../context/context.server";
import type { BusinessContext } from "../context/context.types";
import {
  assessContextDrift,
  buildExecutionKey,
  canApprove,
  canTransition,
  derivePlanState,
  guardExecution,
  type PlanStepState,
} from "./actionOrchestrator";
import { adapterForModule, dispatchToAdapter, validateCapability, validatePayload } from "./executionAdapter";
import { contextMetricValue, deriveExpectedMetrics } from "./expectedMetrics";
import {
  computeEffectiveness,
  confidenceAdjustment,
  isMeasurable,
  measureAfterIso,
  scoreMetric,
  type MetricObservation,
  type ScoredOutcome,
} from "./outcomeVerifier";
import type {
  ActionBoard,
  ActionRisk,
  ActionState,
  ExecuteActionInput,
  ExecuteActionResult,
  ExecutionCapability,
  ExpectedMetric,
  GovernActionInput,
  ListActionBoardInput,
  MeasureOutcomesInput,
  OrchestratedAction,
  OutcomeBoard,
  OutcomeRecord,
  PrepareActionsInput,
  VerifyActionInput,
} from "./orchestration.types";
import { CAPABILITY_RISK, type JsonObject } from "./orchestration.types";

type Sb = any;

/* --------------------------------- helpers --------------------------------- */

function snapshotOf(ctx: BusinessContext) {
  return {
    occupancyCurrent: ctx.occupancy.current,
    occupancyForecast: ctx.occupancy.forecast,
    adr: ctx.revenue.adr,
    bookingPace: ctx.revenue.booking_pace,
    capturedAt: ctx.generated_at,
  };
}

function rowToAction(row: any, decisionTitle: string | null = null, stepSequence: number | null = null): OrchestratedAction {
  return {
    id: row.id,
    decisionId: row.decision_id ?? null,
    decisionTitle,
    planId: row.plan_id ?? null,
    planStepId: row.plan_step_id ?? null,
    planStepSequence: stepSequence,
    module: row.module,
    actionType: row.action_type,
    title: row.title ?? null,
    adapter: row.adapter ?? null,
    capability: (row.capability ?? null) as ExecutionCapability | null,
    payload: row.payload ?? {},
    risk: (row.risk_level ?? "low") as ActionRisk,
    status: row.status as ActionState,
    requiresApproval: !!row.requires_approval,
    requestedBy: row.requested_by ?? null,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ?? null,
    executionKey: row.execution_key ?? null,
    executionReference: row.execution_reference ?? null,
    executionResult: row.result ?? {},
    error: row.error_message ?? null,
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 2),
    contextStatus: (row.context_status ?? "unchecked") as OrchestratedAction["contextStatus"],
    createdAt: row.created_at,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
  };
}

/** Deterministic mapping from a plan step to the capability that can serve it. */
export function capabilityForStep(module: string, title: string, objective: string): ExecutionCapability {
  const text = `${title} ${objective}`.toLowerCase();
  if (module === "revenue" && /(rate|price|pricing|adr|discount)/.test(text)) return "pricing.review";
  if (module === "marketing" && /(campaign|promotion|offer|email|newsletter)/.test(text)) return "campaign.draft";
  if (/(notify|inform|alert|brief)/.test(text)) return "notification.create";
  return "task.create";
}

function payloadForCapability(
  capability: ExecutionCapability,
  step: { title: string; objective: string; expected_outcome: string | null; responsible_role: string | null; module: string },
  decisionTitle: string,
): JsonObject {
  const rationale = [step.objective, step.expected_outcome ? `Expected outcome: ${step.expected_outcome}` : null]
    .filter(Boolean)
    .join("\n\n");
  switch (capability) {
    case "notification.create":
      return {
        title: step.title,
        body: `${decisionTitle}. ${step.objective}`.slice(0, 1000),
        role: (step.responsible_role || "manager").toLowerCase(),
        href: "/admin/intelligence/actions",
      };
    case "campaign.draft":
      return { name: step.title.slice(0, 160), objective: step.objective.slice(0, 500), audience: "Direct guests", notes: rationale };
    case "pricing.review":
      return {
        title: step.title.slice(0, 160),
        rationale: rationale.slice(0, 2000),
        suggestedDirection: /reduce|lower|discount/.test(`${step.title} ${step.objective}`.toLowerCase()) ? "decrease" : "increase",
        window: "Next 14 nights",
      };
    default:
      return {
        title: step.title.slice(0, 160),
        description: rationale.slice(0, 2000),
        category: step.module,
        priority: 2,
        dueInHours: 48,
      };
  }
}

async function emit(
  supabase: Sb,
  userId: string,
  module: string,
  eventType: string,
  payload: JsonObject,
  dedupeKey: string,
) {
  try {
    const { recordEvent } = await import("../events/events.server");
    await recordEvent(supabase, userId, {
      module,
      eventType,
      source: "intelligence.orchestration",
      severity: "info",
      payload,
      dedupeKey,
    } as any);
  } catch {
    // Observability must never block orchestration.
  }
}

/* ------------------------------ 1. prepare --------------------------------- */

/**
 * Turn an approved decision's plan into concrete, adapter-bound actions.
 * Idempotent per plan step — re-running never duplicates work.
 */
export async function prepareActions(supabase: Sb, userId: string, input: PrepareActionsInput) {
  await assertIntelDecide(supabase, userId);

  const { data: decision, error } = await supabase
    .from("intelligence_decisions")
    .select("id, module, domain, title, status, risk_level, expected_metrics, context")
    .eq("id", input.decisionId)
    .single();
  if (error || !decision) throw new Error(error?.message ?? "Decision not found.");
  if (!["approved", "modified", "executing"].includes(String(decision.status))) {
    throw new Error("Only an approved decision can be prepared for execution.");
  }

  const { data: plan } = await supabase
    .from("intelligence_plans")
    .select("id, status")
    .eq("decision_id", decision.id)
    .maybeSingle();
  if (!plan) throw new Error("This decision has no plan to execute.");

  const { data: steps } = await supabase
    .from("intelligence_plan_steps")
    .select("*")
    .eq("plan_id", plan.id)
    .order("sequence", { ascending: true });

  const ctx = await getBusinessContext(supabase, userId, { windowDays: 14 } as any);
  const snapshot = snapshotOf(ctx);

  // Capture the yardstick once, before anything executes.
  if (!decision.expected_metrics || (decision.expected_metrics as any[]).length === 0) {
    await supabase
      .from("intelligence_decisions")
      .update({ expected_metrics: deriveExpectedMetrics(String(decision.domain), ctx) })
      .eq("id", decision.id);
  }

  let created = 0;
  let skipped = 0;

  for (const step of (steps ?? []) as any[]) {
    const dedupeKey = `plan_step:${step.id}`;
    const { data: existing } = await supabase
      .from("intelligence_actions")
      .select("id")
      .eq("dedupe_key", dedupeKey)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const capability = capabilityForStep(String(step.module), String(step.title), String(step.objective ?? ""));
    const adapter = adapterForModule(String(step.module)) ?? adapterForModule("platform")!;
    const check = validateCapability(adapter.key, capability);
    const resolvedCapability: ExecutionCapability = check.ok ? capability : "task.create";
    const risk = CAPABILITY_RISK[resolvedCapability];
    const payload = payloadForCapability(resolvedCapability, step, String(decision.title));

    const { data: action } = await supabase
      .from("intelligence_actions")
      .insert({
        module: step.module,
        decision_id: decision.id,
        plan_id: plan.id,
        plan_step_id: step.id,
        action_type: resolvedCapability,
        title: step.title,
        payload,
        adapter: adapter.key,
        capability: resolvedCapability,
        risk_level: risk,
        automated: false,
        requires_approval: true,
        status: "pending_approval",
        dedupe_key: dedupeKey,
        requested_by: userId,
        context_snapshot: snapshot,
        context_status: "fresh",
      })
      .select("id")
      .single();
    if (!action) continue;

    await supabase
      .from("intelligence_actions")
      .update({ execution_key: buildExecutionKey({ decisionId: decision.id, planStepId: step.id, actionId: action.id }) })
      .eq("id", action.id);
    created += 1;
  }

  return { ok: true as const, created, skipped };
}

/* -------------------------------- 2. board --------------------------------- */

export async function getActionBoard(supabase: Sb, userId: string, input: ListActionBoardInput): Promise<ActionBoard> {
  await assertIntelRead(supabase, userId);
  const allowed = await visibleModules(supabase, userId);
  const modules = input.module ? allowed.filter((m) => m === input.module) : allowed;

  let q = supabase
    .from("intelligence_actions")
    .select("*")
    .in("module", modules)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];

  const decisionIds = [...new Set(rows.map((r) => r.decision_id).filter(Boolean))];
  const titles = new Map<string, string>();
  if (decisionIds.length) {
    const { data: decisions } = await supabase.from("intelligence_decisions").select("id, title").in("id", decisionIds);
    for (const d of (decisions ?? []) as any[]) titles.set(d.id, d.title);
  }

  const stepIds = [...new Set(rows.map((r) => r.plan_step_id).filter(Boolean))];
  const seqs = new Map<string, number>();
  if (stepIds.length) {
    const { data: steps } = await supabase.from("intelligence_plan_steps").select("id, sequence").in("id", stepIds);
    for (const s of (steps ?? []) as any[]) seqs.set(s.id, Number(s.sequence));
  }

  const actions = rows.map((r) =>
    rowToAction(r, r.decision_id ? (titles.get(r.decision_id) ?? null) : null, r.plan_step_id ? (seqs.get(r.plan_step_id) ?? null) : null),
  );

  const { count: verificationPending } = await supabase
    .from("intelligence_outcomes")
    .select("id", { count: "exact", head: true })
    .eq("verification_status", "pending");

  const countBy = (s: ActionState) => actions.filter((a) => a.status === s).length;
  return {
    generated_at: new Date().toISOString(),
    actions,
    counts: {
      pendingApproval: countBy("pending_approval") + countBy("proposed"),
      queued: countBy("queued") + countBy("approved"),
      executing: countBy("executing"),
      failed: countBy("failed"),
      verificationPending: verificationPending ?? 0,
      completed: countBy("completed"),
    },
  };
}

/* ------------------------------ 3. governance ------------------------------ */

const DECISION_TO_STATE: Record<GovernActionInput["decision"], ActionState> = {
  approve: "approved",
  reject: "rejected",
  cancel: "cancelled",
  queue: "queued",
  expire: "expired",
};

/** Approve, reject, queue, cancel or expire an action — always explicit, always logged. */
export async function governAction(supabase: Sb, userId: string, input: GovernActionInput) {
  await assertIntelDecide(supabase, userId);

  const { data: row, error } = await supabase.from("intelligence_actions").select("*").eq("id", input.actionId).single();
  if (error || !row) throw new Error(error?.message ?? "Action not found.");

  const from = row.status as ActionState;
  const to = DECISION_TO_STATE[input.decision];
  if (!canTransition(from, to)) throw new Error(`Cannot ${input.decision} an action that is ${from}.`);

  const risk = (row.risk_level ?? "low") as ActionRisk;
  if (to === "approved") {
    const roles = await rolesFor(supabase, userId);
    if (!canApprove(risk, roles)) throw new Error(`${risk} risk actions require an owner or administrator.`);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };

  if (to === "approved") {
    const ctx = await getBusinessContext(supabase, userId, { windowDays: 14 } as any);
    patch.approved_by = userId;
    patch.approved_at = now;
    patch.context_snapshot = snapshotOf(ctx);
    patch.context_status = "fresh";
    if (row.decision_id) {
      const { data: decision } = await supabase
        .from("intelligence_decisions")
        .select("domain, expected_metrics")
        .eq("id", row.decision_id)
        .single();
      if (decision && (!decision.expected_metrics || (decision.expected_metrics as any[]).length === 0)) {
        await supabase
          .from("intelligence_decisions")
          .update({ expected_metrics: deriveExpectedMetrics(String(decision.domain), ctx) })
          .eq("id", row.decision_id);
      }
    }
  }
  if (input.note) patch.error_message = from === "failed" ? input.note : row.error_message;

  const { error: upErr } = await supabase.from("intelligence_actions").update(patch).eq("id", input.actionId);
  if (upErr) throw new Error(upErr.message);

  await emit(supabase, userId, row.module, `action.${input.decision === "approve" ? "approved" : to}`, {
    action_id: row.id,
    decision_id: row.decision_id,
    from,
    to,
    note: input.note ?? null,
  }, `action:${row.id}:${to}`);

  return { ok: true as const, status: to };
}

/* ------------------------------- 4. execute -------------------------------- */

/** Execute an approved action exactly once, through its module's adapter. */
export async function executeAction(supabase: Sb, userId: string, input: ExecuteActionInput): Promise<ExecuteActionResult> {
  await assertIntelDecide(supabase, userId);

  const { data: row, error } = await supabase.from("intelligence_actions").select("*").eq("id", input.actionId).single();
  if (error || !row) throw new Error(error?.message ?? "Action not found.");

  const executionKey =
    row.execution_key ?? buildExecutionKey({ decisionId: row.decision_id, planStepId: row.plan_step_id, actionId: row.id });

  // Idempotency: a succeeded execution row is the single source of truth.
  const { data: prior } = await supabase
    .from("intelligence_executions")
    .select("id, status, execution_reference")
    .eq("execution_key", executionKey)
    .eq("status", "succeeded")
    .maybeSingle();

  const risk = (row.risk_level ?? "low") as ActionRisk;
  const guard = guardExecution({
    status: row.status as ActionState,
    retry: input.retry,
    retryCount: Number(row.retry_count ?? 0),
    maxRetries: Number(row.max_retries ?? 2),
    risk,
    approvedBy: row.approved_by ?? null,
    hasSucceededExecution: !!prior,
  });

  const ctx = await getBusinessContext(supabase, userId, { windowDays: 14 } as any);
  const drift = assessContextDrift(row.context_snapshot ?? null, snapshotOf(ctx));

  if (!guard.allowed) {
    return {
      ok: false,
      duplicate: !!guard.duplicate,
      status: row.status,
      executionReference: prior?.execution_reference ?? row.execution_reference ?? null,
      contextDrift: drift,
      message: guard.reason,
    };
  }

  // Context revalidation: a stale plan must not fire on old assumptions.
  await supabase.from("intelligence_actions").update({ context_status: drift.status }).eq("id", row.id);
  if (drift.status === "stale" && !input.acceptContextDrift) {
    return {
      ok: false,
      duplicate: false,
      status: row.status,
      executionReference: null,
      contextDrift: drift,
      message: `Business context has moved materially since approval. Re-evaluate the decision, or execute again acknowledging the change. ${drift.reasons.join(" ")}`,
    };
  }

  const capability = row.capability as ExecutionCapability | null;
  const adapterKey = row.adapter as string | null;
  if (!capability || !adapterKey) {
    return { ok: false, duplicate: false, status: row.status, executionReference: null, contextDrift: drift, message: "This action has no execution adapter — prepare it from its decision first." };
  }
  const payloadCheck = validatePayload(capability, row.payload ?? {});
  if (!payloadCheck.ok) {
    return { ok: false, duplicate: false, status: row.status, executionReference: null, contextDrift: drift, message: `Invalid action payload — ${payloadCheck.reason}` };
  }

  const startedAt = new Date().toISOString();
  await supabase
    .from("intelligence_actions")
    .update({ status: "executing", started_at: startedAt, execution_key: executionKey })
    .eq("id", row.id);

  const { data: execRow } = await supabase
    .from("intelligence_executions")
    .insert({
      action_id: row.id,
      execution_key: executionKey,
      adapter: adapterKey,
      capability,
      module: row.module,
      attempt: guard.attempt,
      status: "requested",
      request: payloadCheck.data,
      requested_by: userId,
    })
    .select("id")
    .single();

  await emit(supabase, userId, row.module, "action.started", { action_id: row.id, attempt: guard.attempt }, `action:${row.id}:started:${guard.attempt}`);

  const result = await dispatchToAdapter(supabase, {
    adapter: adapterKey,
    capability,
    payload: payloadCheck.data,
    actionId: row.id,
    decisionId: row.decision_id ?? null,
  });
  const completedAt = new Date().toISOString();

  if (execRow) {
    await supabase
      .from("intelligence_executions")
      .update({
        status: result.ok ? "succeeded" : "failed",
        response: result.response,
        execution_reference: result.executionReference,
        error: result.error ?? null,
        completed_at: completedAt,
      })
      .eq("id", execRow.id);
  }

  if (!result.ok) {
    await supabase
      .from("intelligence_actions")
      .update({
        status: "failed",
        error_message: result.error ?? "Execution failed.",
        retry_count: guard.attempt,
        completed_at: completedAt,
      })
      .eq("id", row.id);
    await emit(supabase, userId, row.module, "action.failed", { action_id: row.id, error: result.error ?? null }, `action:${row.id}:failed:${guard.attempt}`);
    return { ok: false, duplicate: false, status: "failed", executionReference: null, contextDrift: drift, message: result.error ?? "Execution failed." };
  }

  await supabase
    .from("intelligence_actions")
    .update({
      status: "completed",
      execution_reference: result.executionReference,
      result: result.response,
      error_message: null,
      retry_count: guard.attempt,
      executed_at: completedAt,
      completed_at: completedAt,
    })
    .eq("id", row.id);

  if (row.plan_step_id) {
    await supabase
      .from("intelligence_plan_steps")
      .update({ status: "done", completed_at: completedAt })
      .eq("id", row.plan_step_id);
  }
  await refreshPlanState(supabase, userId, row.plan_id ?? null);
  await seedOutcomes(supabase, row, completedAt);

  await emit(supabase, userId, row.module, "action.completed", {
    action_id: row.id,
    execution_reference: result.executionReference,
    manual_follow_up: !!result.manualFollowUp,
  }, `action:${row.id}:completed`);

  return {
    ok: true,
    duplicate: false,
    status: "completed",
    executionReference: result.executionReference,
    contextDrift: drift,
    message: result.manualFollowUp
      ? "Executed — the owning module now holds a draft for a human to finish."
      : "Executed successfully.",
  };
}

async function refreshPlanState(supabase: Sb, userId: string, planId: string | null) {
  if (!planId) return;
  const { data: plan } = await supabase.from("intelligence_plans").select("id, decision_id, status").eq("id", planId).single();
  if (!plan) return;
  const { data: steps } = await supabase
    .from("intelligence_plan_steps")
    .select("id, sequence, depends_on, status")
    .eq("plan_id", planId);
  const { data: failed } = await supabase
    .from("intelligence_actions")
    .select("id")
    .eq("plan_id", planId)
    .eq("status", "failed")
    .limit(1);

  const stepStates: PlanStepState[] = ((steps ?? []) as any[]).map((s) => ({
    id: s.id,
    sequence: Number(s.sequence),
    dependsOn: s.depends_on === null || s.depends_on === undefined ? null : Number(s.depends_on),
    status: String(s.status),
  }));
  const next = derivePlanState(String(plan.status), stepStates, ((failed ?? []) as any[]).length > 0);
  if (next !== plan.status) {
    await supabase.from("intelligence_plans").update({ status: next }).eq("id", planId);
    if (next === "completed" || next === "blocked") {
      await emit(supabase, userId, "platform", `plan.${next === "completed" ? "completed" : "blocked"}`, { plan_id: planId, decision_id: plan.decision_id }, `plan:${planId}:${next}`);
    }
  }
}

/** Create the pending outcome rows the verifier will later measure. */
async function seedOutcomes(supabase: Sb, actionRow: any, executedAt: string) {
  if (!actionRow.decision_id) return;
  const { data: decision } = await supabase
    .from("intelligence_decisions")
    .select("id, module, expected_metrics")
    .eq("id", actionRow.decision_id)
    .single();
  const metrics = (decision?.expected_metrics ?? []) as ExpectedMetric[];
  for (const metric of metrics) {
    const { data: existing } = await supabase
      .from("intelligence_outcomes")
      .select("id")
      .eq("decision_id", actionRow.decision_id)
      .eq("action_id", actionRow.id)
      .eq("metric_key", metric.metricKey)
      .maybeSingle();
    if (existing) continue;
    await supabase.from("intelligence_outcomes").insert({
      decision_id: actionRow.decision_id,
      action_id: actionRow.id,
      plan_id: actionRow.plan_id ?? null,
      module: decision?.module ?? actionRow.module,
      metric_key: metric.metricKey,
      label: metric.label,
      comparator: metric.comparator,
      unit: metric.unit,
      target_value: metric.targetValue,
      baseline_value: metric.baselineValue,
      result: "pending",
      verification_status: "pending",
      measure_after: measureAfterIso(metric, executedAt),
      evidence: { source: metric.source, executed_at: executedAt },
    });
  }
}

/* -------------------------- 5. verify and measure -------------------------- */

async function observeMetric(supabase: Sb, metricKey: string, ctx: BusinessContext, actionId: string | null): Promise<MetricObservation> {
  const now = new Date().toISOString();
  const fromContext = contextMetricValue(metricKey, ctx);
  if (fromContext !== null) return { metricKey, actualValue: fromContext, measuredAt: now, source: "business_context" };

  if (metricKey === "operations.open_intelligence_tasks") {
    const { count } = await supabase
      .from("ops_tasks")
      .select("id", { count: "exact", head: true })
      .eq("task_type", "intelligence")
      .in("status", ["open", "in_progress"]);
    return { metricKey, actualValue: count ?? 0, measuredAt: now, source: "ops_tasks" };
  }
  if (metricKey === "guest.vip_preparation_completed") {
    if (!actionId) return { metricKey, actualValue: null, measuredAt: now };
    const { data } = await supabase
      .from("intelligence_actions")
      .select("status")
      .eq("id", actionId)
      .maybeSingle();
    return { metricKey, actualValue: data?.status === "completed" ? 1 : 0, measuredAt: now, source: "intelligence_actions" };
  }
  return { metricKey, actualValue: null, measuredAt: now };
}

/**
 * Measure every outcome whose measurement window has opened, score it against
 * its captured target, and feed the result back into feedback and memory.
 */
export async function measureOutcomes(supabase: Sb, userId: string, input: MeasureOutcomesInput) {
  await assertIntelRead(supabase, userId);
  const nowIso = new Date().toISOString();

  let q = supabase
    .from("intelligence_outcomes")
    .select("*")
    .in("verification_status", ["pending"])
    .lte("measure_after", nowIso)
    .order("measure_after", { ascending: true })
    .limit(input.limit);
  if (input.decisionId) q = q.eq("decision_id", input.decisionId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];
  if (rows.length === 0) return { ok: true as const, measured: 0, met: 0, missed: 0 };

  const ctx = await getBusinessContext(supabase, userId, { windowDays: 14 } as any);
  const scoredByDecision = new Map<string, ScoredOutcome[]>();
  let met = 0;
  let missed = 0;

  for (const row of rows) {
    const metric: ExpectedMetric = {
      metricKey: row.metric_key,
      label: row.label,
      comparator: row.comparator,
      unit: row.unit,
      targetValue: row.target_value === null ? null : Number(row.target_value),
      baselineValue: row.baseline_value === null ? null : Number(row.baseline_value),
      measureAfterHours: 0,
      source: row.evidence?.source ?? "unknown",
    };
    const observation = await observeMetric(supabase, row.metric_key, ctx, row.action_id ?? null);
    const scored = scoreMetric(metric, observation);

    await supabase
      .from("intelligence_outcomes")
      .update({
        actual_value: scored.actualValue,
        variance: scored.variance,
        achievement: scored.achievement,
        result: scored.result,
        verification_status: scored.verificationStatus,
        note: scored.note,
        measured_at: observation.measuredAt,
        evidence: { ...(row.evidence ?? {}), observed_source: observation.source ?? null },
      })
      .eq("id", row.id);

    if (scored.result === "met") met += 1;
    if (scored.result === "missed") missed += 1;
    scoredByDecision.set(row.decision_id, [...(scoredByDecision.get(row.decision_id) ?? []), scored]);

    await emit(supabase, userId, row.module, scored.result === "met" ? "outcome.met" : scored.result === "missed" ? "outcome.missed" : "outcome.verified", {
      outcome_id: row.id,
      decision_id: row.decision_id,
      metric: row.metric_key,
      achievement: scored.achievement,
    }, `outcome:${row.id}:verified`);
  }

  // Learn: every measured decision writes feedback and an observed memory.
  const { remember } = await import("../memory/memory.server");
  for (const [decisionId, scored] of scoredByDecision) {
    const { data: decision } = await supabase
      .from("intelligence_decisions")
      .select("id, module, domain, title, recommended_option_key")
      .eq("id", decisionId)
      .single();
    if (!decision) continue;
    const adjustment = confidenceAdjustment(scored);
    const metCount = scored.filter((s) => s.result === "met").length;

    await supabase.from("intelligence_feedback").insert({
      subject_type: "recommendation",
      subject_id: decisionId,
      module: decision.module,
      stage: "learn",
      useful: adjustment >= 0,
      comment: `Outcome verification: ${metCount}/${scored.length} targets met. ${scored.map((s) => s.note).join(" ")}`.slice(0, 2000),
      created_by: userId,
    });

    try {
      await remember(supabase, userId, {
        scope: "property",
        module: decision.module,
        memoryKey: `outcome.${decision.domain}.${decision.recommended_option_key ?? "selected"}`,
        memoryValue: `${decision.title}: ${metCount}/${scored.length} expected outcomes met after execution.`,
        memoryType: "outcome",
        memoryTier: "observed",
        confidence: Math.min(0.9, Math.max(0.2, 0.5 + adjustment)),
        source: "outcome_verifier",
        metadata: { decision_id: decisionId, confidence_adjustment: adjustment, metrics: scored },
      } as any);
    } catch {
      // Memory write is best-effort; verification stands regardless.
    }
  }

  return { ok: true as const, measured: rows.length, met, missed };
}

/** Verify a single action's outcomes on demand (same scoring path). */
export async function verifyAction(supabase: Sb, userId: string, input: VerifyActionInput) {
  await assertIntelRead(supabase, userId);
  const { data: action } = await supabase
    .from("intelligence_actions")
    .select("id, decision_id, completed_at")
    .eq("id", input.actionId)
    .single();
  if (!action) throw new Error("Action not found.");
  if (!action.decision_id) return { ok: true as const, measured: 0, met: 0, missed: 0 };
  return measureOutcomes(supabase, userId, { decisionId: action.decision_id, limit: 50 });
}

/* ----------------------------- 6. outcome board ---------------------------- */

function outcomeRow(row: any, title: string | null): OutcomeRecord {
  return {
    id: row.id,
    decisionId: row.decision_id,
    decisionTitle: title,
    actionId: row.action_id ?? null,
    module: row.module,
    metricKey: row.metric_key,
    label: row.label,
    comparator: row.comparator,
    unit: row.unit,
    targetValue: row.target_value === null ? null : Number(row.target_value),
    actualValue: row.actual_value === null ? null : Number(row.actual_value),
    baselineValue: row.baseline_value === null ? null : Number(row.baseline_value),
    variance: row.variance === null ? null : Number(row.variance),
    achievement: row.achievement === null ? null : Number(row.achievement),
    result: row.result,
    verificationStatus: row.verification_status,
    note: row.note ?? null,
    measureAfter: row.measure_after ?? null,
    measuredAt: row.measured_at ?? null,
    createdAt: row.created_at,
  };
}

export async function getOutcomeBoard(supabase: Sb, userId: string, input: { limit: number }): Promise<OutcomeBoard> {
  await assertIntelRead(supabase, userId);
  const allowed = await visibleModules(supabase, userId);

  const { data, error } = await supabase
    .from("intelligence_outcomes")
    .select("*")
    .in("module", allowed)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as any[];

  const decisionIds = [...new Set(rows.map((r) => r.decision_id).filter(Boolean))];
  const decisions = new Map<string, any>();
  if (decisionIds.length) {
    const { data: ds } = await supabase
      .from("intelligence_decisions")
      .select("id, title, module, status, confidence, constraints, reasoning")
      .in("id", decisionIds);
    for (const d of (ds ?? []) as any[]) decisions.set(d.id, d);
  }

  const outcomes = rows.map((r) => outcomeRow(r, decisions.get(r.decision_id)?.title ?? null));

  // Effectiveness per decision, from the evidence that exists.
  const effectiveness = [];
  for (const id of decisionIds) {
    const d = decisions.get(id);
    if (!d) continue;
    const mine = outcomes.filter((o) => o.decisionId === id && o.achievement !== null);
    const outcomeAchievement =
      mine.length === 0 ? null : Math.min(1, mine.reduce((s, o) => s + (o.achievement as number), 0) / mine.length);

    const { data: actions } = await supabase.from("intelligence_actions").select("status").eq("decision_id", id);
    const actionRows = (actions ?? []) as any[];
    const attempted = actionRows.filter((a) => ["completed", "failed"].includes(String(a.status)));
    const executionSuccess =
      attempted.length === 0 ? null : attempted.filter((a) => a.status === "completed").length / attempted.length;
    const decided = actionRows.filter((a) => ["approved", "queued", "executing", "completed", "failed", "rejected"].includes(String(a.status)));
    const recommendationAcceptance =
      decided.length === 0 ? null : decided.filter((a) => a.status !== "rejected").length / decided.length;

    effectiveness.push(
      computeEffectiveness({
        decisionId: id,
        decisionTitle: d.title,
        module: d.module,
        predictionAccuracy: d.confidence === null ? null : Number(d.confidence),
        recommendationAcceptance,
        executionSuccess,
        outcomeAchievement,
        strategicAlignment: Array.isArray(d.constraints) && d.constraints.length > 0 ? 1 : null,
      }),
    );
  }

  const countRes = (r: string) => outcomes.filter((o) => o.result === r).length;
  return {
    generated_at: new Date().toISOString(),
    outcomes,
    effectiveness,
    counts: {
      met: countRes("met"),
      partiallyMet: countRes("partially_met"),
      missed: countRes("missed"),
      unavailable: countRes("unavailable"),
      pending: countRes("pending"),
    },
  };
}