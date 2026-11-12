import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  externalReservationSchema,
  type ExternalReservationEvent,
} from "./reservation-ingestion.contracts";
import {
  decryptReservationPayload,
  fingerprintReservationPayload,
  readReservationPayloadKey,
  reservationPayloadAad,
} from "./reservation-payload-crypto.server";
import { finishDistributionWebhook, type DistributionWebhookLease } from "../adapters/webhook-processing.server";

const FINANCIAL_EVENTS = new Set([
  "reservation.payment_updated",
  "reservation.refund_notified",
  "reservation.refund_reversed",
  "reservation.settlement_reported",
  "reservation.settlement_adjusted",
]);

const FINANCIAL_FIELDS = [
  "originalCurrency", "grossAmount", "taxes", "fees", "channelCommission",
  "expectedSettlement", "paymentAmount", "paymentCurrency", "paymentStatus",
  "paymentReference", "settlementReference", "settlementAmount", "settlementCurrency",
  "settlementAt", "settlementDueAt", "exchangeRate", "settlementAdjustmentType",
  "refundAmount", "refundCurrency", "refundReference", "refundAt",
  "refundReversalAmount", "refundReversalReference",
] as const;

export function buildProviderFinancialEvidence(event: ExternalReservationEvent): Record<string, unknown> {
  if (!FINANCIAL_EVENTS.has(event.eventType)) {
    throw new Error("Unsupported provider financial event.");
  }
  const evidence: Record<string, unknown> = {};
  for (const field of FINANCIAL_FIELDS) {
    const value = event[field];
    if (value !== undefined) evidence[field] = value;
  }
  if (Object.keys(evidence).length === 0) {
    throw new Error("Provider financial event contains no financial evidence.");
  }
  return Object.freeze(evidence);
}

type FinanceLease = DistributionWebhookLease & Readonly<{
  payload_fingerprint: string;
  external_account_id: string;
  connection_id: string;
}>;

function parseFinanceLease(row: unknown, workerId: string): FinanceLease {
  if (!row || typeof row !== "object") throw new Error("Finance claim returned an invalid lease.");
  const lease = row as Record<string, unknown>;
  if (typeof lease.id !== "string" || typeof lease.lease_token !== "string" ||
      lease.processing_status !== "processing" || lease.lease_owner !== workerId ||
      typeof lease.lease_expires_at !== "string" || typeof lease.payload_fingerprint !== "string" ||
      typeof lease.provider_key !== "string" || typeof lease.external_account_id !== "string" ||
      typeof lease.provider_event_id !== "string" || typeof lease.connection_id !== "string" ||
      typeof lease.normalized_event !== "object" || lease.normalized_event === null ||
      Array.isArray(lease.normalized_event) || !FINANCIAL_EVENTS.has(String(lease.event_type))) {
    throw new Error("Finance claim returned an invalid or out-of-scope lease.");
  }
  return Object.freeze(lease as unknown as FinanceLease);
}

async function decryptFinanceEvent(lease: FinanceLease): Promise<ExternalReservationEvent> {
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_distribution_reservation_payloads")
    .select("payload_fingerprint,ciphertext,nonce,auth_tag,key_version")
    .eq("inbox_id", lease.id)
    .maybeSingle();
  if (error || !data || data.payload_fingerprint !== lease.payload_fingerprint) {
    throw new Error("Encrypted provider financial evidence is unavailable or mismatched.");
  }
  const raw = decryptReservationPayload<unknown>(
    { ciphertext: String(data.ciphertext), nonce: String(data.nonce), authTag: String(data.auth_tag) },
    readReservationPayloadKey(String(data.key_version)),
    reservationPayloadAad(lease.provider_key, lease.external_account_id, lease.provider_event_id),
  );
  const event = externalReservationSchema.parse(raw);
  if (fingerprintReservationPayload(event) !== lease.payload_fingerprint ||
      event.providerEventId !== lease.provider_event_id ||
      event.eventType !== lease.event_type ||
      event.externalReservationId !== lease.normalized_event.externalReservationId ||
      event.providerKey !== lease.provider_key) {
    throw new Error("Decrypted financial event does not match its verified inbox envelope.");
  }
  return event;
}

/** Stores provider money notifications as immutable evidence; it never posts a payment or refund. */
export async function processNextDistributionFinancialEvidence(
  workerId: string,
  leaseSeconds = 60,
): Promise<Record<string, unknown> | null> {
  const normalizedWorkerId = workerId.trim();
  if (!normalizedWorkerId || normalizedWorkerId.length > 128 ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
    throw new Error("Provider finance worker lease is invalid.");
  }
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_claim_distribution_finance_webhook",
    { _worker_id: normalizedWorkerId, _lease_seconds: leaseSeconds },
  );
  if (error) throw new Error("Provider finance webhook claim failed.");
  if (!Array.isArray(data) || data.length === 0) return null;
  const lease = parseFinanceLease(data[0], normalizedWorkerId);

  try {
    const event = await decryptFinanceEvent(lease);
    const evidence = buildProviderFinancialEvidence(event);
    const evidenceFingerprint = fingerprintReservationPayload(evidence);
    const result = await (supabaseAdmin as any).rpc("staynas_record_distribution_financial_evidence", {
      _inbox_id: lease.id,
      _lease_token: lease.lease_token,
      _worker_id: normalizedWorkerId,
      _payload_fingerprint: lease.payload_fingerprint,
      _external_reservation_id: event.externalReservationId,
      _event_type: event.eventType,
      _provider_event_id: event.providerEventId,
      _evidence: evidence,
      _evidence_fingerprint: evidenceFingerprint,
    });
    if (result.error) throw new Error("Provider financial evidence persistence failed.");
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (!row || typeof row !== "object") throw new Error("Provider financial evidence returned an invalid result.");
    return row as Record<string, unknown>;
  } catch (error) {
    await finishDistributionWebhook({
      inboxId: lease.id,
      leaseToken: lease.lease_token,
      workerId: normalizedWorkerId,
      status: "retryable_failure",
      safeSummary: "Provider financial evidence could not be verified or reconciled.",
      retryAfterSeconds: 60,
    });
    throw error;
  }
}
