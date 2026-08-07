/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/** Recommend — advisory next-best-actions derived from insights. */
import type {
  DecideRecommendationInput,
  ListRecommendationsInput,
  RecordRecommendationInput,
} from "../core/contracts";
import { assertIntelDecide, assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

export async function recordRecommendation(supabase: Sb, userId: string, input: RecordRecommendationInput) {
  await assertIntelRead(supabase, userId);
  const { data, error } = await supabase
    .from("intelligence_recommendations")
    .insert({
      module: input.module,
      insight_id: input.insightId ?? null,
      recommendation_key: input.recommendationKey ?? null,
      title: input.title,
      rationale: input.rationale,
      suggested_action: input.suggestedAction ?? null,
      action_type: input.actionType ?? null,
      action_payload: input.actionPayload,
      expected_impact: input.expectedImpact ?? null,
      impact_value: input.impactValue ?? null,
      impact_unit: input.impactUnit ?? null,
      priority: input.priority,
      confidence: input.confidence,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function listRecommendations(supabase: Sb, userId: string, input: ListRecommendationsInput) {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  let q = supabase
    .from("intelligence_recommendations")
    .select("*")
    .in("module", input.module ? modules.filter((m) => m === input.module) : modules)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) q = q.eq("status", input.status);
  if (input.entityId) q = q.eq("entity_id", input.entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function decideRecommendation(supabase: Sb, userId: string, input: DecideRecommendationInput) {
  await assertIntelDecide(supabase, userId);
  const { error } = await supabase
    .from("intelligence_recommendations")
    .update({
      status: input.decision,
      decision_note: input.note ?? null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}