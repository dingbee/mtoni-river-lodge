import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DistributionWebhookProcessingStatus =
  | "processed"
  | "retryable_failure"
  | "permanent_failure"
  | "ignored"
  | "manual_reconciliation";

export type DistributionWebhookLease = Readonly<{
  id: string;
  connection_id?: string | null;
  organisation_id: string;
  property_id: string;
  account_grant_id: string;
  external_account_id: string;
  provider_key: string;
  environment: "sandbox" | "live";
  provider_event_id: string;
  event_type: string;
  payload_fingerprint: string;
  normalized_event: Record<string, unknown>;
  correlation_id: string;
  processing_status: "processing";
  attempt_count: number;
  max_attempts: number;
  lease_token: string;
  lease_owner: string;
  lease_started_at: string;
  lease_expires_at: string;
}>;

export type DistributionWebhookRpc = (
  functionName: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

export type DistributionWebhookReplayRepository = Readonly<{
  getAuthenticatedUser(accessToken: string): Promise<{ id: string } | null>;
  getInboxScope(inboxId: string): Promise<{ propertyId: string; status: string } | null>;
  hasReplayPermission(propertyId: string, userId: string): Promise<boolean>;
}>;

const sensitiveTextPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b\+?[0-9]{10,15}\b/,
  /\bBearer\s+[A-Za-z0-9._~-]{12,}\b/i,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/i,
];

function assertSafeOperatorText(value: string, label: string, min: number, max: number): string {
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max ||
      sensitiveTextPatterns.some((pattern) => pattern.test(normalized))) {
    throw new Error(`Distribution webhook ${label} is invalid or contains sensitive data.`);
  }
  return normalized;
}

function assertWorkerLease(row: unknown, workerId: string): DistributionWebhookLease {
  if (!row || typeof row !== "object") {
    throw new Error("Distribution webhook claim returned an invalid lease.");
  }
  const lease = row as Record<string, unknown>;
  if (typeof lease.id !== "string" || typeof lease.lease_token !== "string" ||
      lease.processing_status !== "processing" || lease.lease_owner !== workerId ||
      typeof lease.lease_expires_at !== "string" ||
      !Number.isInteger(lease.attempt_count) ||
      typeof lease.normalized_event !== "object" || lease.normalized_event === null ||
      Array.isArray(lease.normalized_event)) {
    throw new Error("Distribution webhook claim returned an invalid lease.");
  }
  return Object.freeze(lease as unknown as DistributionWebhookLease);
}

export function buildClaimDistributionWebhookArgs(workerId: string, leaseSeconds = 60) {
  const normalizedWorkerId = workerId.trim();
  if (normalizedWorkerId.length < 1 || normalizedWorkerId.length > 128) {
    throw new Error("Distribution webhook worker identity must contain 1 to 128 characters.");
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
    throw new Error("Distribution webhook lease must be between 5 and 300 seconds.");
  }
  return Object.freeze({ _worker_id: normalizedWorkerId, _lease_seconds: leaseSeconds });
}

export async function claimDistributionWebhookWithRpc(
  rpc: DistributionWebhookRpc,
  workerId: string,
  leaseSeconds = 60,
): Promise<DistributionWebhookLease | null> {
  const args = buildClaimDistributionWebhookArgs(workerId, leaseSeconds);
  const { data, error } = await rpc("staynas_claim_distribution_webhook", args);
  if (error) throw new Error("Distribution webhook claim failed.");
  if (!Array.isArray(data) || data.length === 0) return null;
  return assertWorkerLease(data[0], args._worker_id);
}

export type FinishDistributionWebhookInput = Readonly<{
  inboxId: string;
  leaseToken: string;
  workerId: string;
  status: DistributionWebhookProcessingStatus;
  safeSummary?: string | null;
  reconciliationCode?: string | null;
  retryAfterSeconds?: number | null;
}>;

export function buildFinishDistributionWebhookArgs(input: FinishDistributionWebhookInput) {
  if (!input.inboxId.trim() || !input.leaseToken.trim() ||
      !input.workerId.trim() || input.workerId.trim().length > 128) {
    throw new Error("Distribution webhook completion context is incomplete.");
  }
  const retry = input.retryAfterSeconds ?? null;
  if (input.status === "retryable_failure") {
    if (!Number.isInteger(retry) || retry! < 1 || retry! > 86_400) {
      throw new Error("Distribution webhook retry delay must be between 1 and 86400 seconds.");
    }
  } else if (retry !== null) {
    throw new Error("Retry delay is only valid for retryable webhook failures.");
  }

  const code = input.reconciliationCode == null
    ? null
    : assertSafeOperatorText(input.reconciliationCode, "reconciliation code", 1, 96);
  if ((input.status === "permanent_failure" || input.status === "manual_reconciliation") !== (code !== null)) {
    throw new Error("A reconciliation code is required only for terminal exception outcomes.");
  }

  const summary = input.safeSummary == null
    ? null
    : assertSafeOperatorText(input.safeSummary, "safe summary", 1, 500);
  if ((input.status === "processed") !== (summary === null)) {
    throw new Error("Processed webhook outcomes must omit summaries; all other outcomes require one.");
  }

  return Object.freeze({
    _inbox_id: input.inboxId,
    _lease_token: input.leaseToken,
    _worker_id: input.workerId.trim(),
    _status: input.status,
    _safe_summary: summary,
    _reconciliation_code: code,
    _retry_after_seconds: retry,
  });
}

export async function finishDistributionWebhookWithRpc(
  rpc: DistributionWebhookRpc,
  input: FinishDistributionWebhookInput,
): Promise<void> {
  const args = buildFinishDistributionWebhookArgs(input);
  const { error } = await rpc("staynas_finish_distribution_webhook", args);
  if (error) throw new Error("Distribution webhook completion was rejected.");
}

export function createDistributionWebhookReplayService(
  repository: DistributionWebhookReplayRepository,
  rpc: DistributionWebhookRpc,
) {
  return async function requeueDistributionWebhook(input: Readonly<{
    accessToken: string;
    inboxId: string;
    reason: string;
    additionalAttempts?: number;
  }>): Promise<void> {
    if (!input.accessToken.trim() || !input.inboxId.trim()) {
      throw new Error("Authenticated webhook replay context is incomplete.");
    }
    const reason = assertSafeOperatorText(input.reason, "replay reason", 8, 500);
    const additionalAttempts = input.additionalAttempts ?? 5;
    if (!Number.isInteger(additionalAttempts) || additionalAttempts < 1 || additionalAttempts > 10) {
      throw new Error("Additional webhook attempts must be between 1 and 10.");
    }

    const principal = await repository.getAuthenticatedUser(input.accessToken);
    if (!principal?.id) throw new Error("Webhook replay requires an authenticated operator.");
    const scope = await repository.getInboxScope(input.inboxId);
    if (!scope) throw new Error("Webhook event was not found.");
    if (!["manual_reconciliation", "permanent_failure", "ignored"].includes(scope.status)) {
      throw new Error("Only terminal webhook exceptions may be manually replayed.");
    }
    if (!await repository.hasReplayPermission(scope.propertyId, principal.id)) {
      throw new Error("Operator is not authorized to replay webhook events for this property.");
    }

    const { error } = await rpc("staynas_requeue_distribution_webhook", {
      _inbox_id: input.inboxId,
      _operator_id: principal.id,
      _reason: reason,
      _additional_attempts: additionalAttempts,
    });
    if (error) throw new Error("Distribution webhook replay was rejected.");
  };
}

const supabaseRpc: DistributionWebhookRpc = (functionName, args) =>
  (supabaseAdmin as any).rpc(functionName, args);

const replayRepository: DistributionWebhookReplayRepository = {
  async getAuthenticatedUser(accessToken) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id };
  },
  async getInboxScope(inboxId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_distribution_webhook_inbox")
      .select("property_id,processing_status")
      .eq("id", inboxId)
      .maybeSingle();
    if (error) throw new Error("Webhook replay scope lookup failed.");
    if (!data) return null;
    return { propertyId: String(data.property_id), status: String(data.processing_status) };
  },
  async hasReplayPermission(propertyId, userId) {
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_property_members")
      .select("role,status")
      .eq("property_id", propertyId)
      .eq("user_id", userId)
      .eq("status", "active");
    if (error) throw new Error("Webhook replay authorization lookup failed.");
    return (data ?? []).some((row: { role?: string; status?: string }) =>
      row.status === "active" && ["owner", "manager", "admin"].includes(row.role ?? ""),
    );
  },
};

export async function claimDistributionWebhook(
  workerId: string,
  leaseSeconds = 60,
): Promise<DistributionWebhookLease | null> {
  return claimDistributionWebhookWithRpc(supabaseRpc, workerId, leaseSeconds);
}

export async function finishDistributionWebhook(input: FinishDistributionWebhookInput): Promise<void> {
  return finishDistributionWebhookWithRpc(supabaseRpc, input);
}

/** Authenticates the operator and checks active property owner/manager/admin membership before replay. */
export const requeueDistributionWebhook = createDistributionWebhookReplayService(
  replayRepository,
  supabaseRpc,
);
