/**
 * Sprint 6 — Action Orchestration & Closed-Loop Intelligence (browser-safe contracts).
 *
 * The Intelligence Core reasons; operational modules execute. Everything in
 * this file is a contract: types, zod schemas and vocabulary. No I/O.
 */
import { z } from "zod";
import { INTEL_MODULES } from "../core/contracts";

/** JSON-safe value — everything crossing the server-function boundary. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/* ----------------------------- action lifecycle ---------------------------- */

export const ACTION_STATES = [
  "draft",
  "proposed", // legacy alias of pending_approval, kept for existing rows
  "pending_approval",
  "approved",
  "queued",
  "executing",
  "completed",
  "failed",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type ActionState = (typeof ACTION_STATES)[number];

export const TERMINAL_ACTION_STATES: readonly ActionState[] = [
  "completed",
  "rejected",
  "cancelled",
  "expired",
];

export const ACTION_RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
export type ActionRisk = (typeof ACTION_RISK_LEVELS)[number];

export const ACTION_RISK_LABEL: Record<ActionRisk, string> = {
  low: "Low — internal task or notification",
  medium: "Medium — prepares work for a module, no live change",
  high: "High — pricing or operating policy",
  critical: "Critical — financial or sensitive operational change",
};

/* --------------------------------- adapters -------------------------------- */

export const EXECUTION_CAPABILITIES = [
  "task.create",
  "notification.create",
  "campaign.draft",
  "pricing.review",
  "policy.change",
] as const;
export type ExecutionCapability = (typeof EXECUTION_CAPABILITIES)[number];

export const CAPABILITY_RISK: Record<ExecutionCapability, ActionRisk> = {
  "task.create": "low",
  "notification.create": "low",
  "campaign.draft": "medium",
  "pricing.review": "high",
  "policy.change": "critical",
};

export const CAPABILITY_LABEL: Record<ExecutionCapability, string> = {
  "task.create": "Create an operations task",
  "notification.create": "Notify a staff role",
  "campaign.draft": "Prepare a marketing campaign draft",
  "pricing.review": "Request a pricing review (no rate is changed by the core)",
  "policy.change": "Change an operating policy (manual, outside the core)",
};

/* ------------------------------ payload schemas ---------------------------- */

export const taskCreatePayloadSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(60).optional(),
  priority: z.number().int().min(1).max(5).default(2),
  dueInHours: z.number().int().min(1).max(720).default(48),
});

export const notificationCreatePayloadSchema = z.object({
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().max(1000).optional(),
  role: z.enum(["owner", "admin", "manager", "reception", "reservations", "finance", "marketing", "housekeeping"]),
  href: z.string().trim().max(300).optional(),
});

export const campaignDraftPayloadSchema = z.object({
  name: z.string().trim().min(3).max(160),
  objective: z.string().trim().max(500).optional(),
  audience: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
  startInDays: z.number().int().min(0).max(180).default(0),
  durationDays: z.number().int().min(1).max(180).default(14),
});

export const pricingReviewPayloadSchema = z.object({
  title: z.string().trim().min(3).max(160),
  rationale: z.string().trim().max(2000),
  suggestedDirection: z.enum(["increase", "hold", "decrease"]),
  suggestedPct: z.number().min(-50).max(50).optional(),
  window: z.string().trim().max(120).optional(),
});

export const policyChangePayloadSchema = z.object({
  title: z.string().trim().min(3).max(160),
  rationale: z.string().trim().max(2000),
});

export const CAPABILITY_PAYLOAD_SCHEMA: Record<ExecutionCapability, z.ZodTypeAny> = {
  "task.create": taskCreatePayloadSchema,
  "notification.create": notificationCreatePayloadSchema,
  "campaign.draft": campaignDraftPayloadSchema,
  "pricing.review": pricingReviewPayloadSchema,
  "policy.change": policyChangePayloadSchema,
};

/* --------------------------------- records --------------------------------- */

export interface OrchestratedAction {
  id: string;
  decisionId: string | null;
  decisionTitle: string | null;
  planId: string | null;
  planStepId: string | null;
  planStepSequence: number | null;
  module: string;
  actionType: string;
  title: string | null;
  adapter: string | null;
  capability: ExecutionCapability | null;
  payload: JsonObject;
  risk: ActionRisk;
  status: ActionState;
  requiresApproval: boolean;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  executionKey: string | null;
  executionReference: string | null;
  executionResult: JsonObject;
  error: string | null;
  retryCount: number;
  maxRetries: number;
  contextStatus: ContextDriftStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ExecutionRecord {
  id: string;
  actionId: string;
  executionKey: string;
  adapter: string;
  capability: string;
  module: string;
  attempt: number;
  status: "requested" | "succeeded" | "failed" | "duplicate" | "rejected";
  request: JsonObject;
  response: JsonObject;
  executionReference: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

/* --------------------------------- outcomes -------------------------------- */

export const OUTCOME_RESULTS = ["pending", "met", "partially_met", "missed", "unavailable"] as const;
export type OutcomeResult = (typeof OUTCOME_RESULTS)[number];

export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "partially_verified",
  "failed",
  "unverifiable",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type Comparator = "gte" | "lte" | "range" | "boolean";

export interface ExpectedMetric {
  metricKey: string;
  label: string;
  comparator: Comparator;
  unit: string | null;
  targetValue: number | null;
  /** Upper bound for `range` comparisons. */
  targetMax?: number | null;
  baselineValue: number | null;
  /** Hours after execution before the metric can be measured fairly. */
  measureAfterHours: number;
  source: string;
}

export interface OutcomeRecord {
  id: string;
  decisionId: string;
  decisionTitle: string | null;
  actionId: string | null;
  module: string;
  metricKey: string;
  label: string;
  comparator: Comparator;
  unit: string | null;
  targetValue: number | null;
  actualValue: number | null;
  baselineValue: number | null;
  variance: number | null;
  achievement: number | null;
  result: OutcomeResult;
  verificationStatus: VerificationStatus;
  note: string | null;
  measureAfter: string | null;
  measuredAt: string | null;
  createdAt: string;
}

export interface DecisionEffectiveness {
  decisionId: string;
  decisionTitle: string;
  module: string;
  /** Each component is 0..1, or null when there is no evidence yet. */
  predictionAccuracy: number | null;
  recommendationAcceptance: number | null;
  executionSuccess: number | null;
  outcomeAchievement: number | null;
  strategicAlignment: number | null;
  /** Mean of the available components. Null when nothing is measurable yet. */
  aggregate: number | null;
  formula: string;
  measuredComponents: string[];
}

/* ------------------------------ context drift ------------------------------ */

export const CONTEXT_DRIFT_STATUSES = ["unchecked", "fresh", "shifted", "stale"] as const;
export type ContextDriftStatus = (typeof CONTEXT_DRIFT_STATUSES)[number];

export interface ContextDrift {
  status: ContextDriftStatus;
  reasons: string[];
  checkedAt: string;
}

/* --------------------------- server function inputs ------------------------ */

const moduleEnum = z.enum(INTEL_MODULES);

export const prepareActionsSchema = z.object({
  decisionId: z.string().uuid(),
});
export type PrepareActionsInput = z.infer<typeof prepareActionsSchema>;

export const listActionBoardSchema = z.object({
  status: z.enum(ACTION_STATES).optional(),
  module: moduleEnum.optional(),
  limit: z.number().int().min(1).max(200).default(60),
});
export type ListActionBoardInput = z.infer<typeof listActionBoardSchema>;

export const governActionSchema = z.object({
  actionId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "cancel", "queue", "expire"]),
  note: z.string().trim().max(1000).optional(),
});
export type GovernActionInput = z.infer<typeof governActionSchema>;

export const executeActionSchema = z.object({
  actionId: z.string().uuid(),
  /** Retry an earlier failure. Bounded by max_retries and re-checked for risk. */
  retry: z.boolean().default(false),
  /** Manager acknowledgement that context moved but execution should proceed. */
  acceptContextDrift: z.boolean().default(false),
});
export type ExecuteActionInput = z.infer<typeof executeActionSchema>;

export const verifyActionSchema = z.object({
  actionId: z.string().uuid(),
});
export type VerifyActionInput = z.infer<typeof verifyActionSchema>;

export const measureOutcomesSchema = z.object({
  decisionId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(50).default(20),
});
export type MeasureOutcomesInput = z.infer<typeof measureOutcomesSchema>;

export const outcomeBoardSchema = z.object({
  limit: z.number().int().min(1).max(100).default(40),
});
export type OutcomeBoardInput = z.infer<typeof outcomeBoardSchema>;

/* --------------------------------- results --------------------------------- */

export interface ActionBoard {
  generated_at: string;
  actions: OrchestratedAction[];
  counts: {
    pendingApproval: number;
    queued: number;
    executing: number;
    failed: number;
    verificationPending: number;
    completed: number;
  };
}

export interface OutcomeBoard {
  generated_at: string;
  outcomes: OutcomeRecord[];
  effectiveness: DecisionEffectiveness[];
  counts: { met: number; partiallyMet: number; missed: number; unavailable: number; pending: number };
}

export interface ExecuteActionResult {
  ok: boolean;
  duplicate: boolean;
  status: ActionState;
  executionReference: string | null;
  contextDrift: ContextDrift;
  message: string;
}

/* ---------------------------- canonical event names ------------------------ */

export const ORCHESTRATION_EVENTS = [
  "action.approved",
  "action.queued",
  "action.started",
  "action.completed",
  "action.failed",
  "action.cancelled",
  "action.expired",
  "outcome.recorded",
  "outcome.verified",
  "outcome.met",
  "outcome.missed",
  "plan.completed",
  "plan.blocked",
] as const;
export type OrchestrationEvent = (typeof ORCHESTRATION_EVENTS)[number];