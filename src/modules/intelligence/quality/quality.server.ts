/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Sprint 7 — Intelligence Quality Metrics (read-only).
 *
 * Every figure is derived from what the loop already recorded. This file never
 * writes: measuring the core must not change the core.
 */
import { assertIntelRead, visibleModules } from "../core/access.server";
import {
  QUALITY_METRIC_TARGET,
  type QualityBoard,
  type QualityByModule,
  type QualityMetric,
  type QualityMetricKey,
} from "./quality.types";

type Sb = any;

const round = (n: number, dp = 3) => Math.round(n * 10 ** dp) / 10 ** dp;

function metric(
  key: QualityMetricKey,
  label: string,
  formula: string,
  numerator: number,
  denominator: number,
  sample: number,
  detail: string,
): QualityMetric {
  return {
    key,
    label,
    value: denominator > 0 ? round(Math.min(1, Math.max(0, numerator / denominator))) : null,
    formula,
    numerator: round(numerator, 2),
    denominator: round(denominator, 2),
    sample,
    detail,
    target: QUALITY_METRIC_TARGET[key],
  };
}

export async function getQualityBoard(
  supabase: Sb,
  userId: string,
  input: { windowDays?: number } = {},
): Promise<QualityBoard> {
  await assertIntelRead(supabase, userId);
  const windowDays = input.windowDays ?? 30;
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const modules = await visibleModules(supabase, userId);

  const [predictions, recommendations, decisions, actions, outcomes, memories, feedback] = await Promise.all([
    supabase
      .from("intelligence_predictions")
      .select("id, module, accuracy, actual_value")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_recommendations")
      .select("id, module, status")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_decisions")
      .select("id, module, status, outcome, decided_at")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_actions")
      .select("id, module, status")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_outcomes")
      .select("id, module, result, achievement, verification_status, decision_id")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_memory")
      .select("id, module, status, memory_tier, use_count")
      .in("module", modules)
      .gte("created_at", since),
    supabase
      .from("intelligence_feedback")
      .select("id, module, useful")
      .in("module", modules)
      .gte("created_at", since),
  ]);

  const predRows = (predictions.data ?? []) as any[];
  const recRows = (recommendations.data ?? []) as any[];
  const decRows = (decisions.data ?? []) as any[];
  const actRows = (actions.data ?? []) as any[];
  const outRows = (outcomes.data ?? []) as any[];
  const memRows = (memories.data ?? []) as any[];
  const fbRows = (feedback.data ?? []) as any[];

  /* 1. Prediction accuracy — scored predictions only. */
  const scored = predRows.filter((p) => p.accuracy !== null && p.accuracy !== undefined);
  const accuracySum = scored.reduce((s, p) => s + Number(p.accuracy), 0);

  /* 2. Recommendation acceptance — accepted vs decided. */
  const accepted = recRows.filter((r) => r.status === "accepted").length;
  const dismissed = recRows.filter((r) => r.status === "dismissed").length;

  /* 3. Decision success — completed vs closed decisions. */
  const decCompleted = decRows.filter((d) => d.status === "completed").length;
  const decFailed = decRows.filter((d) => d.status === "failed").length;
  const decRejected = decRows.filter((d) => d.status === "rejected").length;

  /* 4. Action completion — completed vs actions that left the approval gate. */
  const actTerminalStates = ["completed", "failed", "cancelled", "expired"];
  const actCompleted = actRows.filter((a) => a.status === "completed" || a.status === "applied").length;
  const actClosed = actRows.filter((a) => actTerminalStates.includes(a.status)).length;

  /* 5. Outcome achievement — met counts full, partially met counts half. */
  const measured = outRows.filter((o) => o.result && !["pending", "unavailable"].includes(o.result));
  const achievementScore = measured.reduce(
    (s, o) => s + (o.result === "met" ? 1 : o.result === "partially_met" ? 0.5 : 0),
    0,
  );

  /* 6. Learning effectiveness — curated memory, useful feedback, closed loops. */
  const memAccepted = memRows.filter((m) => m.status === "accepted").length;
  const memDecided = memRows.filter((m) => ["accepted", "dismissed"].includes(m.status)).length;
  const fbUseful = fbRows.filter((f) => f.useful === true).length;
  const fbRated = fbRows.filter((f) => f.useful !== null && f.useful !== undefined).length;
  const closedDecisions = decRows.filter((d) => ["completed", "failed"].includes(d.status));
  const closedWithOutcome = closedDecisions.filter((d) => !!d.outcome).length;
  const learningParts = [
    memDecided > 0 ? memAccepted / memDecided : null,
    fbRated > 0 ? fbUseful / fbRated : null,
    closedDecisions.length > 0 ? closedWithOutcome / closedDecisions.length : null,
  ].filter((n): n is number => n !== null);
  const learningValue = learningParts.length
    ? learningParts.reduce((s, n) => s + n, 0) / learningParts.length
    : 0;

  const metrics: QualityMetric[] = [
    metric(
      "prediction_accuracy",
      "Prediction accuracy",
      "mean(accuracy) over predictions with a recorded actual",
      accuracySum,
      scored.length,
      predRows.length,
      `${scored.length} of ${predRows.length} predictions have been scored against an actual value.`,
    ),
    metric(
      "recommendation_acceptance",
      "Recommendation acceptance rate",
      "accepted ÷ (accepted + dismissed)",
      accepted,
      accepted + dismissed,
      recRows.length,
      `${accepted} accepted, ${dismissed} dismissed, ${recRows.length - accepted - dismissed} still open.`,
    ),
    metric(
      "decision_success",
      "Decision success rate",
      "completed ÷ (completed + failed)",
      decCompleted,
      decCompleted + decFailed,
      decRows.length,
      `${decCompleted} completed, ${decFailed} failed, ${decRejected} rejected at approval.`,
    ),
    metric(
      "action_completion",
      "Action completion rate",
      "completed ÷ (completed + failed + cancelled + expired)",
      actCompleted,
      actClosed,
      actRows.length,
      `${actCompleted} of ${actClosed} closed actions completed; ${actRows.length - actClosed} still in the governed pipeline.`,
    ),
    metric(
      "outcome_achievement",
      "Outcome achievement rate",
      "(met + 0.5 × partially met) ÷ measured outcomes",
      achievementScore,
      measured.length,
      outRows.length,
      `${measured.length} of ${outRows.length} expected metrics have been measured.`,
    ),
    metric(
      "learning_effectiveness",
      "Learning effectiveness",
      "mean(memory acceptance, useful feedback, closed decisions with a recorded outcome)",
      learningValue,
      learningParts.length ? 1 : 0,
      memRows.length + fbRows.length,
      `${memAccepted}/${memDecided || 0} memories curated, ${fbUseful}/${fbRated || 0} feedback entries useful, ${closedWithOutcome}/${closedDecisions.length} closed decisions carry an outcome.`,
    ),
  ];

  /* Per-module rollup. */
  const moduleKeys = Array.from(new Set([...decRows, ...outRows].map((r) => String(r.module))));
  const byModule: QualityByModule[] = moduleKeys
    .map((m) => {
      const d = decRows.filter((r) => r.module === m);
      const o = outRows.filter((r) => r.module === m && r.achievement !== null && r.achievement !== undefined);
      return {
        module: m,
        decisions: d.length,
        approved: d.filter((r) => ["approved", "modified", "executing", "completed"].includes(r.status)).length,
        completed: d.filter((r) => r.status === "completed").length,
        outcomesMeasured: o.length,
        achievement: o.length ? round(o.reduce((s, r) => s + Number(r.achievement), 0) / o.length) : null,
      };
    })
    .sort((a, b) => b.decisions - a.decisions);

  const scoredMetrics = metrics.filter((m) => m.value !== null);
  const composite = scoredMetrics.length
    ? round(scoredMetrics.reduce((s, m) => s + (m.value ?? 0), 0) / scoredMetrics.length)
    : null;

  const attention = metrics
    .filter((m) => m.value === null || m.value < m.target)
    .map((m) =>
      m.value === null
        ? `${m.label}: no evidence yet — ${m.detail}`
        : `${m.label}: ${Math.round(m.value * 100)}% against a ${Math.round(m.target * 100)}% target.`,
    );

  return {
    generated_at: new Date().toISOString(),
    window_days: windowDays,
    headline:
      composite === null
        ? "The loop has not produced enough scored evidence to measure quality yet."
        : `Composite intelligence quality is ${Math.round(composite * 100)}% across ${scoredMetrics.length} measurable metrics.`,
    compositeScore: composite,
    metrics,
    byModule,
    attention,
  };
}