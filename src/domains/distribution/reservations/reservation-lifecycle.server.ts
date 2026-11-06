import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  finishDistributionWebhook,
  type DistributionWebhookLease,
} from "../adapters/webhook-processing.server";
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

export type ReservationLifecycleRpcResult = Readonly<{
  outcome: "applied" | "no_lifecycle_change" | "manual_reconciliation";
  booking_id?: string | null;
  status?: string;
  duplicate?: boolean;
  reason?: string;
  reconciliation_code?: string;
}>;

export function buildReservationLifecycleRpcArgs(
  lease: DistributionWebhookLease,
  event: ExternalReservationEvent,
): Record<string, unknown> {
  if (!lease.id || !lease.lease_token || !lease.lease_owner ||
      !lease.connection_id || !lease.payload_fingerprint) {
    throw new Error("Reservation lifecycle lease is incomplete.");
  }
  if (!["reservation.modified", "reservation.cancelled", "reservation.no_show", "reservation.reinstated"].includes(event.eventType) ||
      event.providerKey !== lease.provider_key ||
      event.providerEventId !== lease.provider_event_id ||
      event.eventType !== lease.event_type ||
      event.externalReservationId !== lease.normalized_event.externalReservationId ||
      event.providerStatus !== lease.normalized_event.providerStatus ||
      event.arrivalDate !== lease.normalized_event.arrivalDate ||
      event.departureDate !== lease.normalized_event.departureDate ||
      event.adults !== lease.normalized_event.adults ||
      event.children !== (lease.normalized_event.children ?? 0) ||
      (event.providerModifiedAt ?? null) !== (lease.normalized_event.providerModifiedAt ?? null)) {
    throw new Error("Decrypted lifecycle payload does not match the durable inbox envelope.");
  }
  if (fingerprintReservationPayload(event) !== lease.payload_fingerprint) {
    throw new Error("Decrypted lifecycle payload fingerprint does not match the inbox.");
  }

  const guestName = [event.guest.firstName, event.guest.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();

  return Object.freeze({
    _inbox_id: lease.id,
    _lease_token: lease.lease_token,
    _worker_id: lease.lease_owner,
    _payload_fingerprint: lease.payload_fingerprint,
    _external_reservation_id: event.externalReservationId,
    _event_type: event.eventType,
    _provider_event_id: event.providerEventId,
    _provider_status: event.providerStatus,
    _provider_modified_at: event.providerModifiedAt ?? null,
    _arrival_date: event.arrivalDate,
    _departure_date: event.departureDate,
    _adults: event.adults,
    _children: event.children,
    _guest_name: guestName || null,
    _guest_email: event.guest.email ?? null,
    _guest_phone: event.guest.phone ?? null,
    _country: event.guest.country ?? null,
  });
}

function parseClaimedLease(row: unknown, workerId: string): DistributionWebhookLease {
  if (!row || typeof row !== "object") {
    throw new Error("Reservation lifecycle claim returned an invalid lease.");
  }
  const lease = row as Record<string, unknown>;
  if (typeof lease.id !== "string" || typeof lease.lease_token !== "string" ||
      lease.processing_status !== "processing" || lease.lease_owner !== workerId ||
      typeof lease.lease_expires_at !== "string" ||
      typeof lease.payload_fingerprint !== "string" ||
      typeof lease.provider_key !== "string" ||
      typeof lease.external_account_id !== "string" ||
      typeof lease.provider_event_id !== "string" ||
      typeof lease.connection_id !== "string" ||
      typeof lease.normalized_event !== "object" || lease.normalized_event === null ||
      Array.isArray(lease.normalized_event)) {
    throw new Error("Reservation lifecycle claim returned an invalid lease.");
  }
  return Object.freeze(lease as unknown as DistributionWebhookLease);
}

export async function claimDistributionReservationLifecycle(
  workerId: string,
  leaseSeconds = 60,
): Promise<DistributionWebhookLease | null> {
  const normalizedWorkerId = workerId.trim();
  if (!normalizedWorkerId || normalizedWorkerId.length > 128 ||
      !Number.isInteger(leaseSeconds) || leaseSeconds < 5 || leaseSeconds > 300) {
    throw new Error("Reservation lifecycle worker lease is invalid.");
  }
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_claim_distribution_reservation_lifecycle",
    { _worker_id: normalizedWorkerId, _lease_seconds: leaseSeconds },
  );
  if (error) throw new Error("Reservation lifecycle claim failed.");
  if (!Array.isArray(data) || data.length === 0) return null;
  return parseClaimedLease(data[0], normalizedWorkerId);
}

async function loadLifecycleEvent(
  lease: DistributionWebhookLease,
): Promise<ExternalReservationEvent> {
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_distribution_reservation_payloads")
    .select("payload_fingerprint,ciphertext,nonce,auth_tag,key_version")
    .eq("inbox_id", lease.id)
    .maybeSingle();
  if (error || !data) throw new Error("Encrypted reservation lifecycle payload is unavailable.");
  if (data.payload_fingerprint !== lease.payload_fingerprint) {
    throw new Error("Encrypted reservation lifecycle payload fingerprint mismatch.");
  }
  const decrypted = decryptReservationPayload<unknown>(
    {
      ciphertext: String(data.ciphertext),
      nonce: String(data.nonce),
      authTag: String(data.auth_tag),
    },
    readReservationPayloadKey(String(data.key_version)),
    reservationPayloadAad(lease.provider_key, lease.external_account_id, lease.provider_event_id),
  );
  const event = externalReservationSchema.parse(decrypted);
  if (fingerprintReservationPayload(event) !== lease.payload_fingerprint) {
    throw new Error("Decrypted reservation lifecycle payload fingerprint does not match the inbox.");
  }
  return event;
}

export async function applyClaimedDistributionReservationLifecycle(
  lease: DistributionWebhookLease,
): Promise<ReservationLifecycleRpcResult> {
  const event = await loadLifecycleEvent(lease);
  const args = buildReservationLifecycleRpcArgs(lease, event);
  const { data, error } = await (supabaseAdmin as any).rpc(
    "staynas_apply_distribution_reservation_lifecycle",
    args,
  );
  if (error) throw new Error("Canonical reservation lifecycle reconciliation failed.");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || !["applied", "no_lifecycle_change", "manual_reconciliation"].includes(row.outcome)) {
    throw new Error("Canonical reservation lifecycle reconciliation returned an invalid outcome.");
  }
  return {
    outcome: row.outcome,
    booking_id: typeof row.booking_id === "string" ? row.booking_id : null,
    status: typeof row.status === "string" ? row.status : undefined,
    duplicate: row.duplicate === true,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    reconciliation_code: typeof row.reconciliation_code === "string" ? row.reconciliation_code : undefined,
  };
}

/** Processes one provider modification/cancellation without mutating payment or settlement records. */
export async function processNextDistributionReservationLifecycle(
  workerId: string,
  leaseSeconds = 60,
): Promise<ReservationLifecycleRpcResult | null> {
  const normalizedWorkerId = workerId.trim();
  const lease = await claimDistributionReservationLifecycle(normalizedWorkerId, leaseSeconds);
  if (!lease) return null;

  try {
    const result = await applyClaimedDistributionReservationLifecycle(lease);
    if (result.outcome === "manual_reconciliation") {
      await finishDistributionWebhook({
        inboxId: lease.id,
        leaseToken: lease.lease_token,
        workerId: normalizedWorkerId,
        status: "manual_reconciliation",
        reconciliationCode: result.reconciliation_code ?? "reservation_requires_review",
        safeSummary: "Provider reservation lifecycle event requires operator reconciliation.",
      });
    } else {
      await finishDistributionWebhook({
        inboxId: lease.id,
        leaseToken: lease.lease_token,
        workerId: normalizedWorkerId,
        status: "processed",
      });
    }
    return result;
  } catch (error) {
    await finishDistributionWebhook({
      inboxId: lease.id,
      leaseToken: lease.lease_token,
      workerId: normalizedWorkerId,
      status: "retryable_failure",
      safeSummary: "Provider reservation lifecycle reconciliation failed before completion.",
      retryAfterSeconds: 60,
    });
    throw error;
  }
}
