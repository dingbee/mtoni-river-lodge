import {
  connectionLifecycleSchema,
  type ConnectionLifecycle,
  type NormalizedAdapterError,
  type NormalizedAdapterErrorCode,
} from "./contracts";

export type LifecycleActor = Readonly<{
  type: "user" | "platform_admin" | "system";
  id: string;
}>;

export type LifecycleTransition = Readonly<{
  from: ConnectionLifecycle;
  to: ConnectionLifecycle;
  actor: LifecycleActor;
  reason: string;
  occurredAt: string;
}>;

const ALLOWED_TRANSITIONS: Readonly<Record<ConnectionLifecycle, readonly ConnectionLifecycle[]>> = {
  draft: ["pending_validation", "suspended", "revoked"],
  pending_validation: ["connected", "degraded", "error", "suspended", "revoked"],
  connected: ["degraded", "suspended", "revoked", "error"],
  degraded: ["connected", "suspended", "revoked", "error"],
  suspended: ["pending_validation", "revoked"],
  revoked: [],
  error: ["pending_validation", "suspended", "revoked"],
};

/** Validates an explicit state change. No implicit health-driven reactivation is allowed. */
export function validateLifecycleTransition(input: LifecycleTransition): LifecycleTransition {
  const from = connectionLifecycleSchema.parse(input.from);
  const to = connectionLifecycleSchema.parse(input.to);
  if (!input.actor.id.trim() || !input.reason.trim()) {
    throw new Error("Lifecycle transitions require an attributed actor and reason.");
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error("Lifecycle transition timestamp must be a valid date.");
  }
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new Error(`Lifecycle transition ${from} -> ${to} is not permitted.`);
  }
  if ((from === "suspended" || from === "revoked") && input.actor.type === "system") {
    throw new Error("System actors cannot reactivate or alter a suspended/revoked connection.");
  }
  return Object.freeze({ ...input, from, to, actor: Object.freeze({ ...input.actor }) });
}

const ERROR_POLICY: Readonly<Record<NormalizedAdapterErrorCode, { retryable: boolean; safeMessage: string }>> = {
  authentication: { retryable: false, safeMessage: "Provider authentication failed. Revalidate the connection credentials." },
  authorization: { retryable: false, safeMessage: "The provider denied this operation. Review account and property grants." },
  configuration: { retryable: false, safeMessage: "The provider connection configuration is invalid." },
  unsupported_capability: { retryable: false, safeMessage: "This adapter does not support the requested capability." },
  rate_limited: { retryable: true, safeMessage: "The provider rate limit was reached. Retry after the indicated delay." },
  timeout: { retryable: true, safeMessage: "The provider request timed out." },
  provider_unavailable: { retryable: true, safeMessage: "The provider is temporarily unavailable." },
  invalid_request: { retryable: false, safeMessage: "The provider rejected the request as invalid." },
  conflict: { retryable: false, safeMessage: "The provider reported a conflicting state." },
  not_found: { retryable: false, safeMessage: "The requested provider resource was not found." },
  permanent_provider_error: { retryable: false, safeMessage: "The provider returned a non-retryable error." },
  unknown: { retryable: false, safeMessage: "An unclassified provider error occurred. Inspect the correlated diagnostic record." },
};

export type AdapterErrorInput = Readonly<{
  code: NormalizedAdapterErrorCode;
  correlationId: string;
  retryAfterMs?: number;
  providerCode?: string;
}>;

/** Creates a safe, stable error without accepting raw provider messages or response bodies. */
export function normalizeAdapterError(input: AdapterErrorInput): NormalizedAdapterError {
  if (!input.correlationId.trim()) throw new Error("A correlation ID is required.");
  const policy = ERROR_POLICY[input.code];
  const providerCode = input.providerCode && /^[A-Za-z0-9_.:-]{1,64}$/.test(input.providerCode)
    ? input.providerCode
    : undefined;
  const retryAfterMs = input.code === "rate_limited" && Number.isFinite(input.retryAfterMs)
    ? Math.min(900_000, Math.max(0, Math.floor(input.retryAfterMs!)))
    : undefined;
  return Object.freeze({
    code: input.code,
    retryable: policy.retryable,
    safeMessage: policy.safeMessage,
    correlationId: input.correlationId,
    ...(providerCode ? { providerCode } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  });
}

export type HealthProbePolicy = Readonly<{
  timeoutMs: number;
  maxRecordedLatencyMs: number;
}>;

export const DEFAULT_HEALTH_PROBE_POLICY: HealthProbePolicy = Object.freeze({
  timeoutMs: 8_000,
  maxRecordedLatencyMs: 30_000,
});

export type HealthProbeAssessment = Readonly<{
  state: "healthy" | "degraded" | "unavailable" | "unknown";
  checkedAt: string;
  latencyMs?: number;
  error?: NormalizedAdapterError;
}>;

/** Pure assessment only; scheduling, timeout enforcement and rate limiting belong to the worker. */
export function assessHealthProbe(
  input: Readonly<{
    completed: boolean;
    succeeded: boolean;
    checkedAt: string;
    latencyMs?: number;
    error?: NormalizedAdapterError;
  }>,
  policy: HealthProbePolicy = DEFAULT_HEALTH_PROBE_POLICY,
): HealthProbeAssessment {
  if (!Number.isFinite(policy.timeoutMs) || policy.timeoutMs <= 0 ||
      !Number.isFinite(policy.maxRecordedLatencyMs) || policy.maxRecordedLatencyMs < policy.timeoutMs) {
    throw new Error("Health probe policy bounds are invalid.");
  }
  if (!Number.isFinite(Date.parse(input.checkedAt))) throw new Error("Health check timestamp is invalid.");
  if (!input.completed) return { state: "unknown", checkedAt: input.checkedAt };
  if (!input.succeeded) {
    return {
      state: input.error?.code === "provider_unavailable" || input.error?.code === "timeout" ? "unavailable" : "degraded",
      checkedAt: input.checkedAt,
      ...(input.error ? { error: input.error } : {}),
    };
  }
  if (!Number.isFinite(input.latencyMs) || input.latencyMs! < 0 ||
      input.latencyMs! > policy.maxRecordedLatencyMs) {
    return { state: "degraded", checkedAt: input.checkedAt };
  }
  return {
    state: input.latencyMs! > policy.timeoutMs ? "degraded" : "healthy",
    checkedAt: input.checkedAt,
    latencyMs: input.latencyMs,
  };
}
