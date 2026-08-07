/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Activation pipeline: Observe → Understand → Reason → Recommend.
 *
 * Runs on demand (event-driven or staff-triggered) — never polls.
 * Every stage is idempotent: events dedupe on their platform id, signals are
 * derived from unprocessed events only, and insights/recommendations dedupe
 * on a deterministic key.
 */
import { assertIntelRead, visibleModules } from "../core/access.server";
import { mapPlatformEvent, REASONING_RULES, ruleFor } from "./event-map";

type Sb = any;

export interface IngestPlatformEventInput {
  eventId: string;
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  occurredAt?: string | null;
}

/** Observe — forward one platform event into the Intelligence Core. */
export async function ingestPlatformEvent(supabase: Sb, userId: string, input: IngestPlatformEventInput) {
  await assertIntelRead(supabase, userId);
  const mapped = mapPlatformEvent(input.type);
  if (!mapped) return { ingested: false as const, reason: "unmapped" };

  const dedupeKey = `platform:${input.eventId}`;
  const { data: existing } = await supabase
    .from("intelligence_events")
    .select("id")
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (existing) return { ingested: false as const, reason: "duplicate", id: existing.id as string };

  const { data, error } = await supabase
    .from("intelligence_events")
    .insert({
      module: mapped.module,
      event_type: mapped.eventType,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      actor_id: userId,
      source: "platform-bus",
      severity: "info",
      payload: input.meta ?? {},
      dedupe_key: dedupeKey,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (String(error.code) === "23505") return { ingested: false as const, reason: "duplicate" };
    throw new Error(error.message);
  }
  return { ingested: true as const, id: data.id as string, module: mapped.module, eventType: mapped.eventType };
}

const HOUR = 3600_000;

function confidenceFor(count: number, baselineSamples: number): number {
  const sample = Math.min(1, (count + baselineSamples) / 30);
  return Math.round(Math.min(0.95, 0.35 + sample * 0.6) * 100) / 100;
}

export interface PipelineResult {
  eventsProcessed: number;
  signalsCreated: number;
  insightsCreated: number;
  recommendationsCreated: number;
  details: Array<{ module: string; eventType: string; deltaPct: number; count: number; escalated: boolean }>;
}

/** Understand → Reason → Recommend over unprocessed events. */
export async function runPipeline(
  supabase: Sb,
  userId: string,
  opts: { module?: string; windowHours?: number } = {},
): Promise<PipelineResult> {
  await assertIntelRead(supabase, userId);
  const allowed = await visibleModules(supabase, userId);
  const modules = opts.module ? allowed.filter((m) => m === opts.module) : allowed;
  const windowHours = opts.windowHours ?? 24;
  const now = Date.now();
  const windowStart = new Date(now - windowHours * HOUR).toISOString();
  const baselineStart = new Date(now - 8 * 24 * HOUR).toISOString();

  const result: PipelineResult = {
    eventsProcessed: 0,
    signalsCreated: 0,
    insightsCreated: 0,
    recommendationsCreated: 0,
    details: [],
  };
  if (modules.length === 0) return result;

  const { data: pending, error } = await supabase
    .from("intelligence_events")
    .select("id, module, event_type, occurred_at")
    .in("module", modules)
    .is("processed_at", null)
    .gte("occurred_at", windowStart)
    .order("occurred_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows: any[] = pending ?? [];
  if (rows.length === 0) return result;

  const groups = new Map<string, { module: string; eventType: string; ids: string[] }>();
  for (const r of rows) {
    const key = `${r.module}::${r.event_type}`;
    const g = groups.get(key) ?? { module: r.module, eventType: r.event_type, ids: [] };
    g.ids.push(r.id);
    groups.set(key, g);
  }

  for (const g of groups.values()) {
    const rule = ruleFor(g.module, g.eventType) ?? REASONING_RULES.find((r) => r.eventType === g.eventType);
    const count = g.ids.length;

    // Baseline: same event type over the previous 7 days, expressed per window.
    const { count: baselineCount } = await supabase
      .from("intelligence_events")
      .select("id", { count: "exact", head: true })
      .eq("module", g.module)
      .eq("event_type", g.eventType)
      .gte("occurred_at", baselineStart)
      .lt("occurred_at", windowStart);
    const baselinePerWindow = ((baselineCount ?? 0) / 7) * (windowHours / 24);
    const deltaPct =
      baselinePerWindow > 0
        ? ((count - baselinePerWindow) / baselinePerWindow) * 100
        : count > 0
          ? 100
          : 0;
    const confidence = confidenceFor(count, baselineCount ?? 0);
    const sources = rule?.reasoningSources ?? ["event_volume", "historical_pattern"];

    const { data: signal } = await supabase
      .from("intelligence_signals")
      .insert({
        module: g.module,
        signal_key: rule?.signalKey ?? `${g.eventType}.volume`,
        label: rule?.signalLabel ?? `${g.eventType} volume`,
        value: Math.round(deltaPct * 10) / 10,
        unit: "%",
        confidence,
        window_start: windowStart,
        window_end: new Date(now).toISOString(),
        source_event_ids: g.ids.slice(0, 100),
        metadata: {
          count,
          baseline_per_window: Math.round(baselinePerWindow * 100) / 100,
          reasoning_sources: sources,
        },
      })
      .select("id")
      .single();
    result.signalsCreated += 1;

    const escalate = !!rule && count >= 2 && Math.abs(deltaPct) >= rule.threshold;
    result.details.push({ module: g.module, eventType: g.eventType, deltaPct: Math.round(deltaPct), count, escalated: escalate });
    if (!escalate || !rule) continue;

    // Reason — one insight per rule per day (deterministic key = idempotent).
    const day = new Date(now).toISOString().slice(0, 10);
    const insightKey = `${rule.signalKey}.${day}`;
    const { data: existingInsight } = await supabase
      .from("intelligence_insights")
      .select("id")
      .eq("module", g.module)
      .eq("insight_key", insightKey)
      .maybeSingle();

    let insightId: string | null = existingInsight?.id ?? null;
    if (!insightId) {
      const { data: ins, error: insErr } = await supabase
        .from("intelligence_insights")
        .insert({
          module: g.module,
          insight_key: insightKey,
          title: rule.insightTitle(deltaPct),
          summary: rule.insightSummary(deltaPct, count),
          severity: Math.abs(deltaPct) >= rule.threshold * 2 ? "high" : "medium",
          importance: Math.abs(deltaPct) >= rule.threshold * 2 ? 4 : 3,
          confidence,
          signal_ids: signal?.id ? [signal.id] : [],
          evidence: { count, delta_pct: Math.round(deltaPct), window_hours: windowHours, source_event_ids: g.ids.slice(0, 20) },
          reasoning_sources: sources,
          generated_by: "activation-pipeline",
        })
        .select("id")
        .single();
      if (!insErr && ins) {
        insightId = ins.id as string;
        result.insightsCreated += 1;
      }
    }

    // Recommend — one open recommendation per rule per day.
    const recKey = `${rule.signalKey}.${day}`;
    const { data: existingRec } = await supabase
      .from("intelligence_recommendations")
      .select("id")
      .eq("module", g.module)
      .eq("recommendation_key", recKey)
      .in("status", ["new", "reviewing"])
      .maybeSingle();
    if (!existingRec) {
      const { error: recErr } = await supabase.from("intelligence_recommendations").insert({
        module: g.module,
        insight_id: insightId,
        recommendation_key: recKey,
        title: rule.recommendation.title,
        rationale: rule.insightSummary(deltaPct, count),
        suggested_action: rule.recommendation.suggestedAction,
        action_type: rule.recommendation.actionType,
        action_payload: { delta_pct: Math.round(deltaPct), count },
        expected_impact: rule.recommendation.impact,
        priority: Math.abs(deltaPct) >= rule.threshold * 2 ? 4 : 3,
        confidence,
        reasoning_sources: sources,
      });
      if (!recErr) result.recommendationsCreated += 1;
    }
  }

  const allIds = rows.map((r) => r.id);
  const { error: markErr } = await supabase
    .from("intelligence_events")
    .update({ processed_at: new Date().toISOString() })
    .in("id", allIds);
  if (markErr) throw new Error(markErr.message);
  result.eventsProcessed = allIds.length;

  return result;
}