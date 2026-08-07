/**
 * Sprint 6 — Action orchestration rules (pure, deterministic, testable).
 *
 * State machine, approval gating, idempotency keys, retry bounds, plan
 * dependency checks and context revalidation. No I/O lives here.
 */
import type {
  ActionRisk,
  ActionState,
  ContextDrift,
  ExecutionCapability,
} from "./orchestration.types";
import { CAPABILITY_RISK, TERMINAL_ACTION_STATES } from "./orchestration.types";

/** Allowed transitions. Anything not listed is rejected server-side. */
export const ALLOWED_TRANSITIONS: Record<ActionState, readonly ActionState[]> = {
  draft: ["pending_approval", "cancelled", "expired"],
  proposed: ["pending_approval", "approved", "rejected", "cancelled", "expired"],
  pending_approval: ["approved", "rejected", "cancelled", "expired"],
  approved: ["queued", "cancelled", "expired"],
  queued: ["executing", "cancelled", "expired"],
  executing: ["completed", "failed"],
  completed: [],
  failed: ["queued", "pending_approval", "cancelled", "expired"],
  rejected: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: ActionState, to: ActionState): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: ActionState, to: ActionState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid action transition: ${from} → ${to}.`);
  }
}

export function isTerminal(state: ActionState): boolean {
  return TERMINAL_ACTION_STATES.includes(state);
}

/* --------------------------------- approval -------------------------------- */

/** Roles permitted to approve an action at each risk level. */
export const APPROVAL_ROLES: Record<ActionRisk, readonly string[]> = {
  low: ["owner", "admin", "manager"],
  medium: ["owner", "admin", "manager"],
  high: ["owner", "admin", "manager"],
  critical: ["owner", "admin"],
};

/**
 * Approval is always required unless the action was explicitly registered as
 * automated AND is low risk. High confidence never implies approval.
 */
export function requiresApproval(risk: ActionRisk, automated: boolean): boolean {
  return !(automated && risk === "low");
}

export function canApprove(risk: ActionRisk, roles: readonly string[]): boolean {
  return roles.some((r) => APPROVAL_ROLES[risk].includes(r));
}

export function riskForCapability(capability: ExecutionCapability): ActionRisk {
  return CAPABILITY_RISK[capability];
}

/* -------------------------------- idempotency ------------------------------ */

/**
 * Immutable execution reference. The same decision + plan step + action can
 * only ever produce one successful execution, whatever retries or duplicate
 * events arrive.
 */
export function buildExecutionKey(input: {
  decisionId: string | null;
  planStepId: string | null;
  actionId: string;
}): string {
  return [input.decisionId ?? "no-decision", input.planStepId ?? "no-step", input.actionId].join(":");
}

export interface ExecutionGuardInput {
  status: ActionState;
  retry: boolean;
  retryCount: number;
  maxRetries: number;
  risk: ActionRisk;
  approvedBy: string | null;
  hasSucceededExecution: boolean;
}

export type ExecutionGuardResult =
  | { allowed: true; attempt: number }
  | { allowed: false; reason: string; duplicate?: boolean };

/** Central guard: everything that must be true before an adapter is called. */
export function guardExecution(input: ExecutionGuardInput): ExecutionGuardResult {
  if (input.hasSucceededExecution) {
    return { allowed: false, duplicate: true, reason: "This action has already been executed successfully." };
  }
  if (input.status === "completed") {
    return { allowed: false, duplicate: true, reason: "Action already completed." };
  }
  if (isTerminal(input.status)) {
    return { allowed: false, reason: `Action is ${input.status} and cannot execute.` };
  }
  if (input.status === "draft" || input.status === "pending_approval" || input.status === "proposed") {
    return { allowed: false, reason: "Action is awaiting approval." };
  }
  if (input.status === "executing") {
    return { allowed: false, duplicate: true, reason: "Action is already executing." };
  }
  if (input.status === "failed" && !input.retry) {
    return { allowed: false, reason: "Action failed — an explicit retry is required." };
  }
  if (!input.approvedBy) {
    return { allowed: false, reason: "Action has no recorded approver." };
  }
  if (input.retry) {
    if (input.retryCount >= input.maxRetries) {
      return { allowed: false, reason: `Retry limit reached (${input.maxRetries}).` };
    }
    if (input.risk === "high" || input.risk === "critical") {
      // Bounded, never silent: high-impact retries go back through approval.
      return { allowed: false, reason: "High-impact actions must be re-approved before a retry." };
    }
  }
  return { allowed: true, attempt: input.retryCount + 1 };
}

/* ---------------------------- plan dependencies ---------------------------- */

export interface PlanStepState {
  id: string;
  sequence: number;
  dependsOn: number | null;
  status: string;
}

/** A step may only run when the step it depends on is done or skipped. */
export function dependencySatisfied(step: PlanStepState, all: readonly PlanStepState[]): boolean {
  if (step.dependsOn === null || step.dependsOn === undefined) return true;
  const parent = all.find((s) => s.sequence === step.dependsOn);
  if (!parent) return true;
  return parent.status === "done" || parent.status === "skipped";
}

export type PlanState =
  | "draft"
  | "approved"
  | "active"
  | "partially_completed"
  | "completed"
  | "blocked"
  | "cancelled"
  | "expired";

/** Deterministic plan state derived from its steps. */
export function derivePlanState(
  current: string,
  steps: readonly PlanStepState[],
  hasFailedAction = false,
): PlanState {
  if (current === "cancelled") return "cancelled";
  if (current === "expired") return "expired";
  if (steps.length === 0) return (current as PlanState) ?? "draft";
  const done = steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  if (done === steps.length) return "completed";
  if (hasFailedAction) return "blocked";
  if (steps.some((s) => s.status === "blocked")) return "blocked";
  if (done > 0) return "partially_completed";
  if (steps.some((s) => s.status === "in_progress")) return "active";
  return current === "approved" ? "approved" : "draft";
}

/* --------------------------- context revalidation -------------------------- */

export interface ContextSnapshotMetrics {
  occupancyCurrent?: number;
  occupancyForecast?: number;
  adr?: number;
  bookingPace?: string;
}

/** Drift thresholds — deliberately conservative and inspectable. */
export const DRIFT_THRESHOLDS = { shifted: 5, stale: 12, adrShiftedPct: 4, adrStalePct: 10 };

/**
 * Compare the context captured when the action was approved with the context
 * now. A stale action must not be executed without re-evaluation.
 */
export function assessContextDrift(
  snapshot: ContextSnapshotMetrics | null | undefined,
  current: ContextSnapshotMetrics | null | undefined,
  now: string = new Date().toISOString(),
): ContextDrift {
  if (!snapshot || !current || Object.keys(snapshot).length === 0) {
    return { status: "unchecked", reasons: ["No context snapshot was captured for this action."], checkedAt: now };
  }

  const reasons: string[] = [];
  let worst: 0 | 1 | 2 = 0;
  const bump = (level: 1 | 2) => {
    if (level > worst) worst = level;
  };

  const occDelta =
    snapshot.occupancyCurrent !== undefined && current.occupancyCurrent !== undefined
      ? Math.round((current.occupancyCurrent - snapshot.occupancyCurrent) * 10) / 10
      : null;
  if (occDelta !== null && Math.abs(occDelta) >= DRIFT_THRESHOLDS.shifted) {
    reasons.push(`Occupancy moved ${occDelta > 0 ? "+" : ""}${occDelta} pts since approval.`);
    bump(Math.abs(occDelta) >= DRIFT_THRESHOLDS.stale ? 2 : 1);
  }

  const fcDelta =
    snapshot.occupancyForecast !== undefined && current.occupancyForecast !== undefined
      ? Math.round((current.occupancyForecast - snapshot.occupancyForecast) * 10) / 10
      : null;
  if (fcDelta !== null && Math.abs(fcDelta) >= DRIFT_THRESHOLDS.shifted) {
    reasons.push(`Forecast occupancy moved ${fcDelta > 0 ? "+" : ""}${fcDelta} pts since approval.`);
    bump(Math.abs(fcDelta) >= DRIFT_THRESHOLDS.stale ? 2 : 1);
  }

  if (snapshot.adr && current.adr) {
    const pct = Math.round(((current.adr - snapshot.adr) / snapshot.adr) * 1000) / 10;
    if (Math.abs(pct) >= DRIFT_THRESHOLDS.adrShiftedPct) {
      reasons.push(`ADR moved ${pct > 0 ? "+" : ""}${pct}% since approval.`);
      bump(Math.abs(pct) >= DRIFT_THRESHOLDS.adrStalePct ? 2 : 1);
    }
  }

  if (snapshot.bookingPace && current.bookingPace && snapshot.bookingPace !== current.bookingPace) {
    reasons.push(`Booking pace changed from ${snapshot.bookingPace} to ${current.bookingPace}.`);
    bump(1);
  }

  if (worst === 0) return { status: "fresh", reasons: ["Business context is materially unchanged."], checkedAt: now };
  return { status: worst === 2 ? "stale" : "shifted", reasons, checkedAt: now };
}