import { describe, expect, it } from "vitest";
import { validatePaymentCallbackIdentity } from "./payment-integrity";

const base = {
  bookingPropertyId: "property-a",
  callbackPropertyId: "property-a",
  bookingIntegrationId: "integration-a",
  callbackIntegrationId: "integration-a",
  bookingProvider: "pesapal",
  callbackProvider: "pesapal",
  storedTransactionId: "txn-a",
  receivedTransactionId: "txn-a",
  storedMerchantReference: "merchant-a",
  receivedMerchantReference: "merchant-a",
};

describe("payment callback tenant isolation", () => {
  it("accepts a matching tenant, integration, provider, transaction and merchant reference", () => {
    expect(validatePaymentCallbackIdentity(base)).toEqual({ ok: true });
  });

  it("rejects tenant B callback against tenant A booking", () => {
    expect(validatePaymentCallbackIdentity({ ...base, callbackPropertyId: "property-b" }))
      .toEqual({ ok: false, reason: "property_mismatch" });
  });

  it("rejects a payment integration owned by another tenant", () => {
    expect(validatePaymentCallbackIdentity({ ...base, callbackIntegrationId: "integration-b" }))
      .toEqual({ ok: false, reason: "integration_mismatch" });
  });

  it("rejects credentials/provider context that names a different provider", () => {
    expect(validatePaymentCallbackIdentity({ ...base, callbackProvider: "other-gateway" }))
      .toEqual({ ok: false, reason: "provider_mismatch" });
  });

  it("rejects a transaction identifier from another tenant or payment attempt", () => {
    expect(validatePaymentCallbackIdentity({ ...base, receivedTransactionId: "txn-b" }))
      .toEqual({ ok: false, reason: "transaction_mismatch" });
  });

  it("rejects a forged merchant reference", () => {
    expect(validatePaymentCallbackIdentity({ ...base, receivedMerchantReference: "merchant-b" }))
      .toEqual({ ok: false, reason: "merchant_reference_mismatch" });
  });

  it("fails closed when integration scope is missing", () => {
    expect(validatePaymentCallbackIdentity({ ...base, bookingIntegrationId: null }))
      .toEqual({ ok: false, reason: "missing_integration" });
  });

  it("fails closed when the booking has no tenant", () => {
    expect(validatePaymentCallbackIdentity({ ...base, bookingPropertyId: null }))
      .toEqual({ ok: false, reason: "missing_property" });
  });
});
