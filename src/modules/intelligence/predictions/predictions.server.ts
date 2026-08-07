/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/** Forecasts. Scored against reality so the Learn stage can measure accuracy. */
import type { ListPredictionsInput, RecordPredictionInput } from "../core/contracts";
import { assertIntelDecide, assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

export async function recordPrediction(supabase: Sb, userId: string, input: RecordPredictionInput) {
  await assertIntelRead(supabase, userId);
  const { data, error } = await supabase
    .from("intelligence_predictions")
    .insert({
      module: input.module,
      prediction_key: input.predictionKey,
      label: input.label ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      horizon_days: input.horizonDays ?? null,
      target_date: input.targetDate ?? null,
      predicted_value: input.predictedValue ?? null,
      predicted_text: input.predictedText ?? null,
      lower_bound: input.lowerBound ?? null,
      upper_bound: input.upperBound ?? null,
      unit: input.unit ?? null,
      confidence: input.confidence,
      model: input.model ?? null,
      inputs: input.inputs,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function listPredictions(supabase: Sb, userId: string, input: ListPredictionsInput) {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  let q = supabase
    .from("intelligence_predictions")
    .select("*")
    .in("module", input.module ? modules.filter((m) => m === input.module) : modules)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.predictionKey) q = q.eq("prediction_key", input.predictionKey);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function scorePrediction(
  supabase: Sb,
  userId: string,
  input: { id: string; actualValue: number },
) {
  await assertIntelDecide(supabase, userId);
  const { data: row, error: readErr } = await supabase
    .from("intelligence_predictions")
    .select("predicted_value")
    .eq("id", input.id)
    .single();
  if (readErr) throw new Error(readErr.message);

  const predicted = Number(row?.predicted_value ?? NaN);
  const accuracy =
    Number.isFinite(predicted) && Math.abs(predicted) > 0
      ? Math.max(0, 1 - Math.abs(predicted - input.actualValue) / Math.abs(predicted))
      : null;

  const { error } = await supabase
    .from("intelligence_predictions")
    .update({
      actual_value: input.actualValue,
      accuracy,
      scored_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  return { ok: true as const, accuracy };
}