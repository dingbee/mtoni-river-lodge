/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/** Unified Intelligence Timeline — one chronological view of the whole loop. */
import { assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

export type TimelineStage =
  | "observe"
  | "understand"
  | "reason"
  | "recommend"
  | "decide"
  | "plan"
  | "act"
  | "learn";

export interface TimelineEntry {
  id: string;
  stage: TimelineStage;
  module: string;
  at: string;
  title: string;
  detail: string | null;
  status: string | null;
  severity: string | null;
  confidence: number | null;
  reasoningSources: string[];
  source: string | null;
}

export async function getIntelligenceTimeline(
  supabase: Sb,
  userId: string,
  input: { module?: string; stage?: TimelineStage; limit?: number } = {},
): Promise<TimelineEntry[]> {
  await assertIntelRead(supabase, userId);
  const allowed = await visibleModules(supabase, userId);
  const modules = input.module ? allowed.filter((m) => m === input.module) : allowed;
  const limit = input.limit ?? 60;
  if (modules.length === 0) return [];

  const want = (s: TimelineStage) => !input.stage || input.stage === s;

  const [events, signals, insights, recommendations, actions, decisions] = await Promise.all([
    want("observe")
      ? supabase.from("intelligence_events").select("id, module, event_type, severity, source, payload, occurred_at").in("module", modules).order("occurred_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
    want("understand")
      ? supabase.from("intelligence_signals").select("id, module, signal_key, label, value, unit, confidence, metadata, created_at").in("module", modules).order("created_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
    want("reason")
      ? supabase.from("intelligence_insights").select("id, module, title, summary, severity, status, confidence, reasoning_sources, created_at").in("module", modules).order("created_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
    want("recommend")
      ? supabase.from("intelligence_recommendations").select("id, module, title, suggested_action, rationale, status, confidence, reasoning_sources, created_at").in("module", modules).order("created_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
    want("act")
      ? supabase.from("intelligence_actions").select("id, module, action_type, title, status, created_at").in("module", modules).order("created_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
    want("decide") || want("plan")
      ? supabase.from("intelligence_decisions").select("id, module, title, trigger, status, risk_level, confidence, reasoning_sources, recommended_option_key, reasoning, created_at").in("module", modules).order("created_at", { ascending: false }).limit(limit)
      : Promise.resolve({ data: [] }),
  ]);

  const entries: TimelineEntry[] = [];

  for (const e of (events as any).data ?? []) {
    entries.push({
      id: `event:${e.id}`, stage: "observe", module: e.module, at: e.occurred_at,
      title: e.event_type, detail: null, status: null, severity: e.severity,
      confidence: null, reasoningSources: [], source: e.source,
    });
  }
  for (const s of (signals as any).data ?? []) {
    const value = s.value === null || s.value === undefined ? null : `${s.value}${s.unit ?? ""}`;
    entries.push({
      id: `signal:${s.id}`, stage: "understand", module: s.module, at: s.created_at,
      title: s.label ?? s.signal_key, detail: value, status: null, severity: null,
      confidence: s.confidence, reasoningSources: (s.metadata?.reasoning_sources as string[]) ?? [], source: s.signal_key,
    });
  }
  for (const i of (insights as any).data ?? []) {
    entries.push({
      id: `insight:${i.id}`, stage: "reason", module: i.module, at: i.created_at,
      title: i.title, detail: i.summary, status: i.status, severity: i.severity,
      confidence: i.confidence, reasoningSources: i.reasoning_sources ?? [], source: null,
    });
  }
  for (const r of (recommendations as any).data ?? []) {
    entries.push({
      id: `recommendation:${r.id}`, stage: "recommend", module: r.module, at: r.created_at,
      title: r.title, detail: r.suggested_action ?? r.rationale, status: r.status, severity: null,
      confidence: r.confidence, reasoningSources: r.reasoning_sources ?? [], source: null,
    });
  }
  for (const a of (actions as any).data ?? []) {
    entries.push({
      id: `action:${a.id}`, stage: "act", module: a.module, at: a.created_at,
      title: a.title ?? a.action_type, detail: a.action_type, status: a.status, severity: null,
      confidence: null, reasoningSources: [], source: null,
    });
  }
  for (const d of (decisions as any).data ?? []) {
    const selected = d.reasoning?.selectedOption ?? d.recommended_option_key ?? null;
    if (want("decide")) {
      entries.push({
        id: `decision:${d.id}`, stage: "decide", module: d.module, at: d.created_at,
        title: d.title, detail: selected ? `Recommended: ${selected}` : d.trigger, status: d.status,
        severity: d.risk_level, confidence: d.confidence, reasoningSources: d.reasoning_sources ?? [],
        source: d.trigger,
      });
    }
    if (want("plan") && selected) {
      entries.push({
        id: `plan:${d.id}`, stage: "plan", module: d.module, at: d.created_at,
        title: `Plan — ${selected}`, detail: d.reasoning?.whatHappensNext?.join(" → ") ?? null,
        status: d.status, severity: null, confidence: null, reasoningSources: [], source: null,
      });
    }
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, limit);
}