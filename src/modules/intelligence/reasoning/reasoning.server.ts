/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Understand + Reason.
 *
 * Signals are measurable derivations of events; insights are explanations
 * built from signals. Reasoning reuses the existing Lovable AI Gateway
 * transport (`src/lib/ai-gateway.server.ts`) — no separate AI pipeline.
 */
import type {
  ListInsightsInput,
  ListSignalsInput,
  RecordInsightInput,
  RecordSignalInput,
} from "../core/contracts";
import { assertIntelDecide, assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

export async function recordSignal(supabase: Sb, userId: string, input: RecordSignalInput) {
  await assertIntelRead(supabase, userId);
  const { data, error } = await supabase
    .from("intelligence_signals")
    .insert({
      module: input.module,
      signal_key: input.signalKey,
      label: input.label ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      value: input.value ?? null,
      value_text: input.valueText ?? null,
      unit: input.unit ?? null,
      confidence: input.confidence,
      window_start: input.windowStart ?? null,
      window_end: input.windowEnd ?? null,
      source_event_ids: input.sourceEventIds,
      metadata: input.metadata,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function listSignals(supabase: Sb, userId: string, input: ListSignalsInput) {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  let q = supabase
    .from("intelligence_signals")
    .select("*")
    .in("module", input.module ? modules.filter((m) => m === input.module) : modules)
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.signalKey) q = q.eq("signal_key", input.signalKey);
  if (input.entityId) q = q.eq("entity_id", input.entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function recordInsight(supabase: Sb, userId: string, input: RecordInsightInput) {
  await assertIntelRead(supabase, userId);
  const { data, error } = await supabase
    .from("intelligence_insights")
    .insert({
      module: input.module,
      insight_key: input.insightKey ?? null,
      title: input.title,
      summary: input.summary,
      detail: input.detail ?? null,
      severity: input.severity,
      importance: input.importance,
      confidence: input.confidence,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      signal_ids: input.signalIds,
      evidence: input.evidence,
      model: input.model ?? null,
      generated_by: input.generatedBy,
      expires_at: input.expiresAt ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function listInsights(supabase: Sb, userId: string, input: ListInsightsInput) {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  let q = supabase
    .from("intelligence_insights")
    .select("*")
    .in("module", input.module ? modules.filter((m) => m === input.module) : modules)
    .order("importance", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(input.limit);
  if (input.status) q = q.eq("status", input.status);
  if (input.entityId) q = q.eq("entity_id", input.entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function decideInsight(
  supabase: Sb,
  userId: string,
  input: { id: string; status: string },
) {
  await assertIntelDecide(supabase, userId);
  const { error } = await supabase
    .from("intelligence_insights")
    .update({ status: input.status, reviewed_by: userId, reviewed_at: new Date().toISOString() })
    .eq("id", input.id);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}

/**
 * Reason over a set of signals with the shared AI Gateway.
 * Advisory only — the caller decides whether to persist the result as an insight.
 * Degrades to a deterministic summary if the gateway is unavailable.
 */
export async function reasonOverSignals(input: {
  module: string;
  context: string;
  signals: Array<{ signal_key: string; label?: string | null; value?: number | null; value_text?: string | null; unit?: string | null }>;
}): Promise<{ title: string; summary: string; confidence: number; model: string | null }> {
  const lines = input.signals
    .map((s) => `- ${s.label ?? s.signal_key}: ${s.value ?? s.value_text ?? "n/a"}${s.unit ? ` ${s.unit}` : ""}`)
    .join("\n");

  try {
    const { callAiGateway, parseAiJson } = await import("@/lib/ai-gateway.server");
    const res = await callAiGateway({
      jsonMode: true,
      system:
        "You are the reasoning layer of a hospitality operating system. Given operational signals, " +
        "produce one concise, factual operational insight. Never invent data. Never address guests. " +
        "Never include personal identifiers such as passport or document numbers. " +
        'Reply as JSON: {"title": string, "summary": string, "confidence": number between 0 and 1}.',
      user: `Module: ${input.module}\nContext: ${input.context}\nSignals:\n${lines}`,
    });
    const parsed = parseAiJson<{ title?: string; summary?: string; confidence?: number }>(res.content);
    if (parsed?.title && parsed?.summary) {
      return {
        title: parsed.title.slice(0, 200),
        summary: parsed.summary.slice(0, 2000),
        confidence: Math.min(Math.max(Number(parsed.confidence ?? 0.5), 0), 1),
        model: res.model,
      };
    }
  } catch (err) {
    console.error("[intelligence] reasoning fell back to deterministic summary", err);
  }

  return {
    title: `${input.module} signal review`,
    summary: lines || "No signals available for this window.",
    confidence: 0.3,
    model: null,
  };
}