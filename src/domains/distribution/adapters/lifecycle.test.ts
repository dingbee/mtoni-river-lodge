import { describe, expect, it } from "vitest";
import { assessHealthProbe, normalizeAdapterError, validateLifecycleTransition } from "./lifecycle";

const at = "2026-11-05T00:00:00.000Z";

describe("connection lifecycle policy", () => {
  it("accepts an attributed draft-to-validation transition", () => {
    expect(
      validateLifecycleTransition({
        from: "draft",
        to: "pending_validation",
        actor: { type: "user", id: "staff-1" },
        reason: "Credentials submitted for validation",
        occurredAt: at,
      }).to,
    ).toBe("pending_validation");
  });

  it("rejects a direct draft-to-connected transition", () => {
    expect(() =>
      validateLifecycleTransition({
        from: "draft",
        to: "connected",
        actor: { type: "system", id: "worker-1" },
        reason: "Probe succeeded",
        occurredAt: at,
      }),
    ).toThrow(/not permitted/);
  });

  it("requires actor attribution and reason", () => {
    expect(() =>
      validateLifecycleTransition({
        from: "connected",
        to: "degraded",
        actor: { type: "system", id: "" },
        reason: "",
        occurredAt: at,
      }),
    ).toThrow(/actor and reason/);
  });

  it("does not allow health automation to reactivate a suspended connection", () => {
    expect(() =>
      validateLifecycleTransition({
        from: "suspended",
        to: "pending_validation",
        actor: { type: "system", id: "health-worker" },
        reason: "Health recovered",
        occurredAt: at,
      }),
    ).toThrow(/cannot reactivate/);
  });

  it("keeps revoked connections terminal", () => {
    expect(() =>
      validateLifecycleTransition({
        from: "revoked",
        to: "pending_validation",
        actor: { type: "platform_admin", id: "admin-1" },
        reason: "Re-enable",
        occurredAt: at,
      }),
    ).toThrow(/not permitted/);
  });
});

describe("normalized adapter errors", () => {
  it("uses policy retryability and safe messages rather than provider text", () => {
    const error = normalizeAdapterError({
      code: "rate_limited",
      correlationId: "corr-1",
      retryAfterMs: 2_000_000,
      providerCode: "TOO_MANY_REQUESTS",
    });
    expect(error.retryable).toBe(true);
    expect(error.retryAfterMs).toBe(900_000);
    expect(error.safeMessage).not.toContain("TOO_MANY_REQUESTS");
    expect(error.providerCode).toBe("TOO_MANY_REQUESTS");
  });

  it("drops unsafe provider codes and ignores retry hints for non-rate-limit errors", () => {
    const error = normalizeAdapterError({
      code: "authentication",
      correlationId: "corr-2",
      retryAfterMs: 5_000,
      providerCode: "Bearer secret-token",
    });
    expect(error.retryable).toBe(false);
    expect(error.retryAfterMs).toBeUndefined();
    expect(error.providerCode).toBeUndefined();
  });

  it("requires a correlation ID", () => {
    expect(() => normalizeAdapterError({ code: "unknown", correlationId: " " })).toThrow(
      /correlation ID/,
    );
  });
});

describe("health probe assessment", () => {
  it("marks a successful bounded probe healthy", () => {
    expect(
      assessHealthProbe({
        completed: true,
        succeeded: true,
        checkedAt: at,
        latencyMs: 120,
      }).state,
    ).toBe("healthy");
  });

  it("marks timeout and provider outage unavailable", () => {
    const error = normalizeAdapterError({ code: "timeout", correlationId: "corr-3" });
    expect(
      assessHealthProbe({
        completed: false,
        succeeded: false,
        checkedAt: at,
        error,
      }).state,
    ).toBe("unknown");
    expect(
      assessHealthProbe({
        completed: true,
        succeeded: false,
        checkedAt: at,
        error,
      }).state,
    ).toBe("unavailable");
  });

  it("marks slow or invalid latency degraded", () => {
    expect(
      assessHealthProbe({
        completed: true,
        succeeded: true,
        checkedAt: at,
        latencyMs: 9_000,
      }).state,
    ).toBe("degraded");
    expect(
      assessHealthProbe({
        completed: true,
        succeeded: true,
        checkedAt: at,
        latencyMs: -1,
      }).state,
    ).toBe("degraded");
  });
});
