/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/** Intelligence Health Monitor — observability for the reasoning loop. */
import { assertIntelRead, visibleModules } from "../core/access.server";

type Sb = any;

async function countRows(supabase: Sb, table: string, modules: string[], since: string, extra?: (q: any) => any) {
  let q = supabase.from(table).select("id", { count: "exact", head: true }).in("module", modules).gte("created_at", since);
  if (extra) q = extra(q);
  const { count } = await q;
  return count ?? 0;
}

export interface IntelHealth {
  windowDays: number;
  events: number;
  eventsUnprocessed: number;
  signals: number;
  insights: number;
  recommendations: number;
  accepted: number;
  dismissed: number;
  actions: number;
  memories: number;
  feedback: number;
  acceptanceRate: number;
  predictionAccuracy: number | null;
  lastEventAt: string | null;
  byModule: Array<{ module: string; events: number; insights: number; recommendations: number }>;
}

export async function getIntelligenceHealth(supabase: Sb, userId: string, windowDays = 30): Promise<IntelHealth> {
  await assertIntelRead(supabase, userId);
  const modules = await visibleModules(supabase, userId);
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const empty: IntelHealth = {
    windowDays, events: 0, eventsUnprocessed: 0, signals: 0, insights: 0, recommendations: 0,
    accepted: 0, dismissed: 0, actions: 0, memories: 0, feedback: 0,
    acceptanceRate: 0, predictionAccuracy: null, lastEventAt: null, byModule: [],
  };
  if (modules.length === 0) return empty;

  const [events, unprocessed, signals, insights, recommendations, accepted, dismissed, actions, memories] =
    await Promise.all([
      countRows(supabase, "intelligence_events", modules, since, (q: any) => q),
      countRows(supabase, "intelligence_events", modules, since, (q: any) => q.is("processed_at", null)),
      countRows(supabase, "intelligence_signals", modules, since),
      countRows(supabase, "intelligence_insights", modules, since),
      countRows(supabase, "intelligence_recommendations", modules, since),
      countRows(supabase, "intelligence_recommendations", modules, since, (q: any) => q.eq("status", "accepted")),
      countRows(supabase, "intelligence_recommendations", modules, since, (q: any) => q.eq("status", "dismissed")),
      countRows(supabase, "intelligence_actions", modules, since),
      countRows(supabase, "intelligence_memory", modules, since),
    ]);

  const { count: feedback } = await supabase
    .from("intelligence_feedback")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);

  const { data: lastEvent } = await supabase
    .from("intelligence_events")
    .select("occurred_at")
    .in("module", modules)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: scored } = await supabase
    .from("intelligence_predictions")
    .select("accuracy")
    .in("module", modules)
    .not("accuracy", "is", null)
    .limit(200);
  const accuracies = (scored ?? []).map((r: any) => Number(r.accuracy)).filter((n: number) => Number.isFinite(n));
  const predictionAccuracy = accuracies.length
    ? Math.round((accuracies.reduce((a: number, b: number) => a + b, 0) / accuracies.length) * 100) / 100
    : null;

  const byModule = await Promise.all(
    modules.map(async (m: string) => ({
      module: m,
      events: await countRows(supabase, "intelligence_events", [m], since),
      insights: await countRows(supabase, "intelligence_insights", [m], since),
      recommendations: await countRows(supabase, "intelligence_recommendations", [m], since),
    })),
  );

  const decided = accepted + dismissed;
  return {
    windowDays,
    events,
    eventsUnprocessed: unprocessed,
    signals,
    insights,
    recommendations,
    accepted,
    dismissed,
    actions,
    memories,
    feedback: feedback ?? 0,
    acceptanceRate: decided ? Math.round((accepted / decided) * 100) / 100 : 0,
    predictionAccuracy,
    lastEventAt: lastEvent?.occurred_at ?? null,
    byModule: byModule.filter((m) => m.events || m.insights || m.recommendations),
  };
}