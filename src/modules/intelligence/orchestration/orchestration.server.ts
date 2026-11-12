/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary. */
/**
 * Sprint 6 â€” Action Orchestration & Closed-Loop Intelligence (persistence).
 *
 * Turns approved decisions into governed, idempotent, verifiable actions:
 * prepare â†’ approve â†’ execute (via a module adapter) â†’ verify â†’ measure â†’ learn.
 * The core still never writes operational data directly; adapters do, and only
 * with capabilities their module has declared.
 */
import {
  assertIntelDecide,
  assertIntelRead,
  rolesFor,
  visibleModules,
} from "../core/access.server";
import { getBusinessContext } from "../context/context.server";
import type { BusinessContext } from "../context/context.types";
import {
  assessContextDrift,
  buildExecutionKey,
  canApprove,
  canTransition,
  derivePlanState,
  guardExecution,
  type PlanStepState,
} from "./actionOrchestrator";
import {
  adapterForModule,
  dispatchToAdapter,
  validateCapability,
  validatePayload,
} from "./executionAdapter";
import { contextMetricValue, deriveExpectedMetrics } from "./expectedMetrics";
import {
  computeEffectiveness,
  confidenceAdjustment,
  isMeasurable,
  measureAfterIso,
  scoreMetric,
  type MetricObservation,
  type ScoredOutcome,
} from "./outcomeVerifier";
import type {
  ActionBoard,
  ActionRisk,
  ActionState,
  ExecuteActionInput,
  ExecuteActionResult,
  ExecutionCapability,
  ExpectedMetric,
  GovernActionInput,
  ListActionBoardInput,
  MeasureOutcomesInput,
  Or¶»§q«^