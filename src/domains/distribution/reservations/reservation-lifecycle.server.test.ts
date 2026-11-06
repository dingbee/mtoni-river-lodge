import { describe, expect, it } from "vitest";
import type { DistributionWebhookLease } from "../adapters/webhook-processing.server";
import { externalReservationSchema } from "./reservation-ingestion.contracts";
import { fingerprintReservationPayload } from "./reservation-payload-crypto.server";
import { buildReservationLifecycleRpcArgs } from "./reservation-lifecycle.server";

const base = {
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "event-2",
  eventType: "reservation.cancelled",
  providerStatus: "cancelled",
  providerModifiedAt: "2026-11-06T10:00:00Z",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-04",
  adults: 2,
  children: 0,
  providerPayloadFingerprint: "a".repeat(64),
};

function fixture(eventInput: Record<string, unknown> = base) {
  const event = externalReservationSchema.parse({
    ...eventInput,
    guest: { firstName: "Ada", lastName: "Guest", email: "ada@example.com" },
  });
  const lease = {
    id: "inbox-1",
    connection_id: "connection-1",
    provider_key: "airbnb",
    external_account_id: "account-1",
    provider_event_id: event.providerEventId,
    event_type: event.eventType,
    payload_fingerprint: fingerprintReservationPayload(event),
    lease_token: "lease-token",
    lease_owner: "worker-1",
    normalized_event: {
      externalReservationId: event.externalReservationId,
      providerStatus: event.providerStatus,
      providerModifiedAt: event.providerModifiedAt ?? null,
      arrivalDate: event.arrivalDate,
      departureDate: event.departureDate,
      adults: event.adults,
      children: event.children,
    },
  } as unknown as DistributionWebhookLease;
  return { event, lease };
}

describe("DC-05.04 reservation lifecycle RPC contract", () => {
  it("binds lifecycle writes to the leased provider event and canonical reservation identity", () => {
    const { event, lease } = fixture();
    const args = buildReservationLifecycleRpcArgs(lease, event);
    expect(args).toMatchObject({
      _inbox_id: "inbox-1",
      _lease_token: "lease-token",
      _worker_id: "worker-1",
      _external_reservation_id: "reservation-1",
      _event_type: "reservation.cancelled",
      _provider_event_id: "event-2",
      _provider_status: "cancelled",
      _provider_modified_at: "2026-11-06T10:00:00Z",
      _guest_name: "Ada Guest",
      _guest_email: "ada@example.com",
    });
  });

  it("rejects payloads that do not match the durable event envelope", () => {
    const { event, lease } = fixture();
    expect(() => buildReservationLifecycleRpcArgs(lease, {
      ...event,
      externalReservationId: "another-reservation",
    })).toThrow(/durable inbox envelope/);
  });

  it("passes missing provider timestamps through for fail-closed manual reconciliation", () => {
    const { event, lease } = fixture({ ...base, providerModifiedAt: undefined });
    const args = buildReservationLifecycleRpcArgs(lease, event);
    expect(args._provider_modified_at).toBeNull();
  });
});
