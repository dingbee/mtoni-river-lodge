import { describe, expect, it } from "vitest";
import {
  assessContextDrift,
  buildExecutionKey,
  canApprove,
  canTransition,
  dependencySatisfied,
  derivePlanState,
  guardExecution,
  requiresApproval,
} from "../actionOrchestrator";
import { validateCapability, validatePayload } from "../executionAdapter";
import { computeEffectiveness, confidenceAdjustment, isMeasurable, scoreMetric } from "../outcomeVerifier";
import type { ExpectedMetric } from "../orchestration.types";

const base = {
  status: "approved" as const,
  retry: false,
  retryCount: 0,
  maxRetries: 2,
  risk: "low" as const,
  approvedBy: "user-1",
  hasSucceededExecution: false,
};

describe("action state machine", () => {
  it("permits the governed path and refuses shortcuts", () => {
    expect(canTransition("pending_approval", "approved")).toBe(true);
    expect(canTransition("approved", "queued")).toBe(true);
    expect(canTransition("queued", "executing")).toBe(true);
    expect(canTransition("executing", "completed")).toBe(true);
    expect(canTransition("pending_approval", "executing")).toBe(false);
    expect(canTransition("completed", "executing")).toBe(false);
    expect(canTransition("rejected", "approved")).toBe(false);
  });

  it("only exempts explicitly automated low-risk actions from approval", () => {
    expect(requiresApproval("low", true)).toBe(false);
    expect(requiresApproval("low", false)).toBe(true);
    expect(requiresApproval("high", true)).toBe(true);
  });

  it("restricts critical approvals to owners and administrators", () => {
    expect(canApprove("critical", ["manager"])).toBe(false);
    expect(canApprove("critical", ["owner"])).toBe(true);
    expect(canApprove("high", ["manager"])).toBe(true);
  });
});

describe("execution guard", () => {
  it("allows a single execution of an approved action", () => {
    expect(guardExecution(base)).toEqual({ allowed: true, attempt: 1 });
  });

  it("refuses a second execution of the same work", () => {
    const r = guardExecution({ ...base, hasSucceededExecution: true });
    expect(r).toMatchObject({ allowed: false, duplicate: true });
  });

  it("refuses unapproved and terminal actions", () => {
    expect(guardExecution({ ...base, status: "pending_approval" }).allowed).toBe(false);
    expect(guardExecution({ ...base, status: "cancelled" }).allowed).toBe(false);
    expect(guardExecution({ ...base, approvedBy: null }).allowed).toBe(false);
  });

  it("bounds retries and sends high-impact retries back for approval", () => {
    expect(guardExecution({ ...base, status: "failed", retry: true }).allowed).toBe(true);
    expect(guardExecution({ ...base, status: "failed", retry: true, retryCount: 2 }).allowed).toBe(false);
    expect(guardExecution({ ...base, status: "failed", retry: true, risk: "high" }).allowed).toBe(false);
    expect(guardExecution({ ...base, status: "failed" }).allowed).toBe(false);
  });

  it("derives a stable idempotency key", () => {
    expect(buildExecutionKey({ decisionId: "d1", planStepId: "s1", actionId: "a1" })).toBe("d1:s1:a1");
    expect(buildExecutionKey({ decisionId: null, planStepId: null, actionId: "a1" })).toBe("no-decision:no-step:a1");
  });
});

describe("context revalidation", () => {
  const snap = { occupancyCurrent: 60, occupancyForecast: 65, adr: 300, bookingPace: "steady" };

  it("passes when nothing material moved", () => {
    expect(assessContextDrift(snap, { ...snap, occupancyCurrent: 62 }).status).toBe("fresh");
  });

  it("flags a shift and a stale plan", () => {
    expect(assessContextDrift(snap, { ...snap, occupancyCurrent: 67 }).status).toBe("shifted");
    expect(assessContextDrift(snap, { ...snap, occupancyCurrent: 80 }).status).toBe("stale");
    expect(assessContextDrift(snap, { ...snap, adr: 340 }).status).toBe("stale");
  });

  it("reports unchecked when no snapshot was captured", () => {
    expect(assessContextDrift(null, snap).status).toBe("unchecked");
  });
});

describe("capability and payload validation", () => {
  it("refuses capabilities a module never declared", () => {
    expect(validateCapability("operations", "pricing.review").ok).toBe(false);
    expect(validateCapability("revenue", "pricing.review").ok).toBe(true);
    expect(validateCapability("restaurant", "task.create").ok).toBe(false);
    expect(validateCapability("nope", "task.create").ok).toBe(false);
  });

  it("refuses malformed payloads before a module is touched", () => {
    expect(validatePayload("task.create", { title: "ok title" }).ok).toBe(true);
    expect(validatePayload("task.create", { title: "x" }).ok).toBe(false);
    expect(validatePayload("notification.create", { title: "Brief team", role: "chef" }).ok).toBe(false);
  });
});

describe("plan progression", () => {
  const steps = [
    { id: "1", sequence: 1, dependsOn: null, status: "done" },
    { id: "2", sequence: 2, dependsOn: 1, status: "pending" },
  ];

  it("honours step dependencies", () => {
    expect(dependencySatisfied(steps[1]!, steps)).toBe(true);
    expect(dependencySatisfied({ ...steps[1]!, dependsOn: 3 }, steps)).toBe(true);
    expect(dependencySatisfied(steps[1]!, [{ ...steps[0]!, status: "pending" }, steps[1]!])).toBe(false);
  });

  it("derives plan state from its steps", () => {
    expect(derivePlanState("approved", steps)).toBe("partially_completed");
    expect(derivePlanState("approved", steps.map((s) => ({ ...s, status: "done" })))).toBe("completed");
    expect(derivePlanState("approved", steps, true)).toBe("blocked");
    expect(derivePlanState("cancelled", steps)).toBe("cancelled");
  });
});

describe("outcome verification", () => {
  const metric: ExpectedMetric = {
    metricKey: "occupancy.current",
    label: "Occupancy",
    comparator: "gte",
    unit: "%",
    baselineValue: 60,
    targetValue: 70,
    measureAfterHours: 168,
    source: "business_context.occupancy.current",
  };

  it("separates met, partially met and missed", () => {
    expect(scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 70, measuredAt: "now" }).result).toBe("met");
    expect(scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 65, measuredAt: "now" }).result).toBe("partially_met");
    expect(scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 61, measuredAt: "now" }).result).toBe("missed");
    expect(scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 55, measuredAt: "now" }).achievement).toBe(0);
  });

  it("marks an unmeasurable metric rather than guessing", () => {
    const s = scoreMetric(metric, null);
    expect(s.result).toBe("unavailable");
    expect(s.verificationStatus).toBe("unverifiable");
  });

  it("respects the measurement window", () => {
    const executed = new Date("2026-01-01T00:00:00Z").toISOString();
    expect(isMeasurable(metric, executed, new Date("2026-01-03T00:00:00Z"))).toBe(false);
    expect(isMeasurable(metric, executed, new Date("2026-01-09T00:00:00Z"))).toBe(true);
  });

  it("averages effectiveness only over available evidence", () => {
    const e = computeEffectiveness({
      decisionId: "d1",
      decisionTitle: "Lift midweek occupancy",
      module: "revenue",
      predictionAccuracy: 0.8,
      recommendationAcceptance: 1,
      executionSuccess: 1,
      outcomeAchievement: 0.6,
      strategicAlignment: null,
    });
    expect(e.measuredComponents).toHaveLength(4);
    expect(e.aggregate).toBeCloseTo(0.85, 2);
    expect(computeEffectiveness({
      decisionId: "d2",
      decisionTitle: "None",
      module: "guest",
      predictionAccuracy: null,
      recommendationAcceptance: null,
      executionSuccess: null,
      outcomeAchievement: null,
      strategicAlignment: null,
    }).aggregate).toBeNull();
  });

  it("feeds a bounded confidence adjustment back to memory", () => {
    const met = scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 72, measuredAt: "now" });
    const missed = scoreMetric(metric, { metricKey: metric.metricKey, actualValue: 55, measuredAt: "now" });
    expect(confidenceAdjustment([met])).toBeCloseTo(0.2, 2);
    expect(confidenceAdjustment([missed])).toBeCloseTo(-0.2, 2);
    expect(confidenceAdjustment([])).toBe(0);
  });
});