/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Act — the execution ledger.
 *
 * The core never mutates another module's data itself. It proposes an action,
 * a human (or an explicitly automated executor) approves it, and the owning
 * module performs the work. Every transition is recorded here.
 */
import type { ListActionsInput, ProposeActionInput, TransitionActionInput } from "../core/contracts";
import { assertIntelDecide, assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

/** Idempotent through `dedupeKey`: the same proposal never queues twice. */
export async function proposeAction(supabase: Sb, userId: string, input: ProposeActionInput) {
  await assertIntelRead(supabase, userId);

  if (input.dedupeKey) {
    const { data: existing } = await supabase
      .from("intelligence_actions")
      .select("id")
      .eq("dedupe_key", input.dedupeKey)
      .maybeSingle();
    if (existing) return { id: existing.id as string, duplicate: true };
  }

  const { data, error } = await supabase
    .from("intelligence_actions")
    .insert({
      module: input.module,
      recommendation_id: input.recommendationId ?? null,
      action_type: input.actionType,
      title: input.title ?? null,
      payload: input.payload,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      automated: input.automated,
      requires_approval: input.requiresApproval,
      dedupe_key: input.dedupeKey ?? null,
      requested_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (String(error.code) === "23505" && input.dedupeKey) return { id: null, duplicate: true };
    throw new Error(error.message);
  }
  return { id: data.id as string, duplicate: false };
}

export async function listActions(supabase: Sb, userId: string, input: ListActionsInput) {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  let q = supabase
    .from("intelligence_actions")
    .select("*")
    .in("module", input.module ? modules.filter((m) => m === input.module) : modules)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) q = q.eq("status", input.status);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function transitionAction(supabase: Sb, userId: string, input: TransitionActionInput) {
  await assertIntelDecide(supabase, userId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "approved") { patch.approved_by = userId; patch.approved_at = now; }
  if (input.status === "executing") patch.executed_at = now;
  if (input.status === "completed" || input.status === "failed") patch.completed_at = now;
  if (input.result) patch.result = input.result;
  if (input.errorMessage) patch.error_message = input.errorMessage;

  const { error } = await supabase.from("intelligence_actions").update(patch).eq("id", input.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}