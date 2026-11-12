import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdapterExecutionContext, AdapterHealth } from "./contracts";
import { normalizeAdapterError } from "./lifecycle";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DistributionCredentialState = "valid" | "invalid" | "unknown" | "not_checked";

export type DistributionHealthEvidenceArgs = Readonly<{
  _organisation_id: string;
  _property_id: string;
  _connection_id: string;
  _capability: string;
  _health_state: AdapterHealth["state"];
  _checked_at: string;
  _latency_ms: number | null;
  _normalized_error_code: string | null;
  _safe_message: string | null;
  _provider_code: string | null;
  _adapter_version: string;
  _credential_state: DistributionCredentialState;
  _correlation_id: string;
  _worker_id: string;
}>;

export function buildDistributionHealthEvidenceArgs(
  context: AdapterExecutionContext,
  health: AdapterHealth,
  workerId: string,
  credentialState: DistributionCredentialState = "not_checked",
): DistributionHealthEvidenceArgs {
  if (
    !context.organisationId ||
    !context.propertyId ||
    !context.connectionId ||
    !context.correlationId ||
    !context.adapterVersion ||
    !workerId.trim()
  ) {
    throw new Error("Distribution health evidence context is incomplete.");
  }
  if (!Number.isFinite(Date.parse(health.checkedAt))) {
    throw new Error("Distribution health check timestamp is invalid.");
  }
  if (
    health.latencyMs !== undefined &&
    (!Number.isInteger(health.latencyMs) || health.latencyMs < 0 || health.latencyMs > 30_000)
  ) {
    throw new Error("Distribution health latency is outside the permitted range.");
  }
  if (health.state === "healthy" && health.error) {
    throw new Error("Healthy evidence cannot contain an error.");
  }
  if (health.error && health.error.correlationId !== context.correlationId) {
    throw new Error("Distribution health error correlation does not match its execution context.");
  }
  const normalizedError = health.error
    ? normalizeAdapterError({
        code: health.error.code,
        correlationId: context.correlationId,
        retryAfterMs: health.error.retryAfterMs,
        providerCode: health.error.providerCode,
      })
    : null;
  return Object.freeze({
    _organisation_id: context.organisationId,
    _property_id: context.propertyId,
    _connection_id: context.connectionId,
    _capability: context.capability,
    _health_state: health.state,
    _checked_at: health.checkedAt,
    _latency_ms: health.latencyMs ?? null,
    _normalized_error_code: normalizedError?.code ?? null,
    _safe_message: normalizedError?.safeMessage ?? null,
    _provider_code: normalizedError?.providerCode ?? null,
    _adapter_version: context.adapterVersion,
    _credential_state: credentialState,
    _correlation_id: context.correlationId,
    _worker_id: workerId.trim(),
  });
}

/** Server-only append operation. It does not execute a provider probe or change connection lifecycle. */
export async function recordDistributionHealthEvidence(
  context: AdapterExecutionContext,
  health: AdapterHealth,
  workerId: string,
  credentialState: DistributionCredentialState = "not_checked",
): Promise<string> {
  const args = buildDistributionHealthEvidenceArgs(context, health, workerId, credentialState);
  const { data, error } = await (supabaseAdmin as unknown as SupabaseClient).rpc(
    "staynas_record_distribution_health_check",
    args,
  );
  if (error || typeof data !== "string") {
    throw new Error("Distribution health evidence could not be durably recorded.");
  }
  return data;
}
