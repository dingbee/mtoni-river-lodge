/**
 * Sprint 7 — Intelligence Quality Metrics (browser-safe contracts).
 *
 * Six measurements that say whether the reasoning loop is actually working:
 * prediction accuracy, recommendation acceptance, decision success, action
 * completion, outcome achievement and learning effectiveness.
 */
import { z } from "zod";

export const QUALITY_METRIC_KEYS = [
  "prediction_accuracy",
  "recommendation_acceptance",
  "decision_success",
  "action_completion",
  "outcome_achievement",
  "learning_effectiveness",
] as const;
export type QualityMetricKey = (typeof QUALITY_METRIC_KEYS)[number];

export interface QualityMetric {
  key: QualityMetricKey;
  label: string;
  /** 0..1, or null when there is not enough evidence yet. */
  value: number | null;
  /** How the value is calculated, in plain language. */
  formula: string;
  numerator: number;
  denominator: number;
  /** Sample size behind the measurement. */
  sample: number;
  detail: string;
  /** Below this the metric is flagged for review. */
  target: number;
}

export interface QualityByModule {
  module: string;
  decisions: number;
  approved: number;
  completed: number;
  outcomesMeasured: number;
  achievement: number | null;
}

export interface QualityBoard {
  generated_at: string;
  window_days: number;
  headline: string;
  /** Mean of the available metrics, 0..1. */
  compositeScore: number | null;
  metrics: QualityMetric[];
  byModule: QualityByModule[];
  /** Metrics that are below target or have no evidence yet. */
  attention: string[];
}

export const qualityBoardSchema = z.object({
  windowDays: z.number().int().min(7).max(365).default(30),
});
export type QualityBoardInput = z.infer<typeof qualityBoardSchema>;

export const QUALITY_METRIC_TARGET: Record<QualityMetricKey, number> = {
  prediction_accuracy: 0.7,
  recommendation_acceptance: 0.5,
  decision_success: 0.7,
  action_completion: 0.8,
  outcome_achievement: 0.6,
  learning_effectiveness: 0.6,
};