/**
 * Sprint 6 — Outcome verification (pure scoring logic).
 *
 * Execution success is not business success. This module separates the two:
 * an action can execute perfectly and still miss its target.
 */
import type {
  Comparator,
  DecisionEffectiveness,
  ExpectedMetric,
  OutcomeResult,
  VerificationStatus,
} from "./orchestration.types";

export interface MetricObservation {
  metricKey: string;
  actualValue: number | null;
  measuredAt: string;
  source?: string;
}

export interface ScoredOutcome {
  metricKey: string;
  actualValue: number | null;
  variance: number | null;
  achievement: number | null;
  result: OutcomeResult;
  verificationStatus: VerificationStatus;
  note: string;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Fraction of the intended movement that actually happened (0..1+). */
export function achievementRatio(metric: ExpectedMetric, actual: number): number | null {
  const { comparator, targetValue, baselineValue, targetMax } = metric;
  if (comparator === "boolean") return actual >= 1 ? 1 : 0;
  if (comparator === "range") {
    if (targetValue === null || targetMax === null || targetMax === undefined) return null;
    if (actual >= targetValue && actual <= targetMax) return 1;
    const distance = actual < targetValue ? targetValue - actual : actual - targetMax;
    const span = Math.max(targetMax - targetValue, 1e-9);
    return clamp01(1 - distance / span);
  }
  if (targetValue === null) return null;
  if (baselineValue === null || baselineValue === targetValue) {
    // No movement expected — score on direction only.
    if (comparator === "gte") return actual >= targetValue ? 1 : clamp01(actual / (targetValue || 1e-9));
    return actual <= targetValue ? 1 : clamp01(targetValue / (actual || 1e-9));
  }
  const intended = targetValue - baselineValue;
  const achieved = actual - baselineValue;
  const ratio = achieved / intended;
  return ratio < 0 ? 0 : round(ratio, 3);
}

/** Score one expected metric against its observation. */
export function scoreMetric(metric: ExpectedMetric, observation: MetricObservation | null): ScoredOutcome {
  if (!observation || observation.actualValue === null || Number.isNaN(observation.actualValue)) {
    return {
      metricKey: metric.metricKey,
      actualValue: null,
      variance: null,
      achievement: null,
      result: "unavailable",
      verificationStatus: "unverifiable",
      note: `No measurement available for ${metric.label}.`,
    };
  }

  const actual = observation.actualValue;
  const variance = metric.targetValue !== null ? round(actual - metric.targetValue) : null;
  const achievement = achievementRatio(metric, actual);

  let result: OutcomeResult;
  if (achievement === null) result = "unavailable";
  else if (achievement >= 0.95) result = "met";
  else if (achievement >= 0.5) result = "partially_met";
  else result = "missed";

  const verificationStatus: VerificationStatus =
    result === "met" ? "verified" : result === "partially_met" ? "partially_verified" : result === "missed" ? "failed" : "unverifiable";

  const targetText =
    metric.comparator === "range"
      ? `${metric.targetValue}–${metric.targetMax}`
      : `${metric.comparator === "lte" ? "≤" : "≥"} ${metric.targetValue}`;

  return {
    metricKey: metric.metricKey,
    actualValue: round(actual),
    variance,
    achievement: achievement === null ? null : round(achievement, 3),
    result,
    verificationStatus,
    note: `${metric.label}: target ${targetText}${metric.unit ? ` ${metric.unit}` : ""}, actual ${round(actual)}${
      achievement === null ? "" : ` (${Math.round(achievement * 100)}% of intended movement)`
    }.`,
  };
}

/** A metric can only be judged once enough time has passed. */
export function isMeasurable(metric: ExpectedMetric, executedAt: string, now: Date = new Date()): boolean {
  const ready = new Date(executedAt).getTime() + metric.measureAfterHours * 3600_000;
  return now.getTime() >= ready;
}

export function measureAfterIso(metric: ExpectedMetric, executedAt: string): string {
  return new Date(new Date(executedAt).getTime() + metric.measureAfterHours * 3600_000).toISOString();
}

/* ----------------------------- effectiveness ------------------------------- */

export interface EffectivenessInput {
  decisionId: string;
  decisionTitle: string;
  module: string;
  /** 0..1 — how close the underlying prediction was to reality. */
  predictionAccuracy: number | null;
  /** Approved recommendations / total decided recommendations. */
  recommendationAcceptance: number | null;
  /** Successful executions / attempted executions. */
  executionSuccess: number | null;
  /** Mean achievement across scored outcomes. */
  outcomeAchievement: number | null;
  /** 1 when the decision respected strategic memory constraints, else 0. */
  strategicAlignment: number | null;
}

export const EFFECTIVENESS_FORMULA =
  "effectiveness = mean(prediction accuracy, recommendation acceptance, execution success, outcome achievement, strategic alignment) over available components";

/** Averages only the components with evidence, and says which those were. */
export function computeEffectiveness(input: EffectivenessInput): DecisionEffectiveness {
  const parts: Array<[string, number | null]> = [
    ["prediction accuracy", input.predictionAccuracy],
    ["recommendation acceptance", input.recommendationAcceptance],
    ["execution success", input.executionSuccess],
    ["outcome achievement", input.outcomeAchievement],
    ["strategic alignment", input.strategicAlignment],
  ];
  const available = parts.filter(([, v]) => v !== null && !Number.isNaN(v as number)) as Array<[string, number]>;
  const aggregate =
    available.length === 0 ? null : round(available.reduce((s, [, v]) => s + clamp01(v), 0) / available.length, 3);

  return {
    decisionId: input.decisionId,
    decisionTitle: input.decisionTitle,
    module: input.module,
    predictionAccuracy: input.predictionAccuracy,
    recommendationAcceptance: input.recommendationAcceptance,
    executionSuccess: input.executionSuccess,
    outcomeAchievement: input.outcomeAchievement,
    strategicAlignment: input.strategicAlignment,
    aggregate,
    formula: EFFECTIVENESS_FORMULA,
    measuredComponents: available.map(([k]) => k),
  };
}

/** Confidence adjustment fed back into memory: −0.2 … +0.2. */
export function confidenceAdjustment(outcomes: readonly ScoredOutcome[]): number {
  const scored = outcomes.filter((o) => o.achievement !== null);
  if (scored.length === 0) return 0;
  const mean = scored.reduce((s, o) => s + (o.achievement as number), 0) / scored.length;
  return round(clamp01(mean) * 0.4 - 0.2, 3);
}

export type { Comparator };