import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertVerifiedReservationWebhook,
  verifyHmacSha256ReservationWebhook,
} from "./provider-signature-verification.server";

const secret = "unit-test-webhook-secret";
const now = 1_799_000_000;
const context = {
  organisationId: "org-1",
  propertyId: "property-1",
  connectionId: "connection-1",
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  environment: "sandbox" as const,
  operation: "reservation.ingest",
  capability: "reservation.import" as const,
  correlationId: "correlation-1",
  adapterVersion: "1.0.0",
  accountGrantId: "grant-1",
  externalAccountId: "external-account-1",
};
const event = {
  providerKey: "airbnb",
  externalAccountReference: "account-1",
  externalReservationId: "reservation-1",
  externalListingId: "listing-1",
  providerEventId: "event-1",
  eventType: "reservation.created",
  providerStatus: "confirmed",
  arrivalDate: "2026-12-01",
  departureDate: "2026-12-03",
  adults: 2,
  children: 0,
  providerPayloadFingerprint: "a".repeat(64),
};
const rawBody = JSON.stringify(event);
const timestamp = String(now);
function signature(body = rawBody, ts = timestamp, signingSecret = secret) {
  return "sha256=" + createHmac("sha256", signingSecret)
    .update(ts + ".")
    .update(body)
    .digest("hex");
}

describe("DC-05 provider webhook signature boundary", () => {
  it("verifies exact raw bytes and returns a branded ingress proof", () => {
    const verified = verifyHmacSha256ReservationWebhook({
      rawBody, signature: signature(), timestamp, context, signingSecret: secret,
    }, { nowSeconds: now });
    assertVerifiedReservationWebhook(verified);
    expect(verified.event.externalReservationId).toBe("reservation-1");
    expect(verified.context.accountGrantId).toBe("grant-1");
  });

  it("rejects a modified body and an invalid signature", () => {
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody: rawBody + " ", signature: signature(), timestamp, context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/signature verification failed/i);
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody, signature: "sha256=" + "0".repeat(64), timestamp, context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/signature verification failed/i);
  });

  it("rejects stale timestamps and malformed timestamp headers", () => {
    const stale = String(now - 301);
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody, signature: signature(rawBody, stale), timestamp: stale, context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/replay window/i);
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody, signature: signature(), timestamp: "not-a-time", context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/timestamp is invalid/i);
  });

  it("rejects provider/account context substitution and invalid event payloads", () => {
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody, signature: signature(), timestamp, context: { ...context, externalAccountReference: "other" }, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/trusted connection context/i);
    const invalid = JSON.stringify({ ...event, departureDate: event.arrivalDate });
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody: invalid, signature: signature(invalid), timestamp, context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow();
  });

  it("rejects caller-forged proof objects at the ingress assertion", () => {
    expect(() => assertVerifiedReservationWebhook({ context, event })).toThrow(/cryptographically verified/i);
  });

  it("rejects malformed JSON even when its signature is valid", () => {
    const invalid = "{";
    expect(() => verifyHmacSha256ReservationWebhook({
      rawBody: invalid, signature: signature(invalid), timestamp, context, signingSecret: secret,
    }, { nowSeconds: now })).toThrow(/valid JSON/i);
  });
});
