export type PaymentCallbackIdentity = {
  bookingPropertyId: string | null | undefined;
  callbackPropertyId?: string | null;
  bookingIntegrationId: string | null | undefined;
  callbackIntegrationId?: string | null;
  bookingProvider: string | null | undefined;
  callbackProvider: string | null | undefined;
  storedTransactionId: string | null | undefined;
  receivedTransactionId: string | null | undefined;
  storedMerchantReference: string | null | undefined;
  receivedMerchantReference: string | null | undefined;
};

export type PaymentIdentityCheck = { ok: true } | { ok: false; reason:
  | "missing_property"
  | "property_mismatch"
  | "missing_integration"
  | "integration_mismatch"
  | "provider_mismatch"
  | "transaction_mismatch"
  | "merchant_reference_mismatch"
};

export function validatePaymentCallbackIdentity(input: PaymentCallbackIdentity): PaymentIdentityCheck {
  if (!input.bookingPropertyId) return { ok: false, reason: "missing_property" };
  if (input.callbackPropertyId && input.callbackPropertyId !== input.bookingPropertyId) {
    return { ok: false, reason: "property_mismatch" };
  }
  if (!input.bookingIntegrationId) return { ok: false, reason: "missing_integration" };
  if (input.callbackIntegrationId && input.callbackIntegrationId !== input.bookingIntegrationId) {
    return { ok: false, reason: "integration_mismatch" };
  }
  if (!input.bookingProvider || !input.callbackProvider ||
      input.bookingProvider.toLowerCase() !== input.callbackProvider.toLowerCase()) {
    return { ok: false, reason: "provider_mismatch" };
  }
  if (!input.storedTransactionId || !input.receivedTransactionId ||
      input.storedTransactionId !== input.receivedTransactionId) {
    return { ok: false, reason: "transaction_mismatch" };
  }
  if (!input.storedMerchantReference || !input.receivedMerchantReference ||
      input.storedMerchantReference !== input.receivedMerchantReference) {
    return { ok: false, reason: "merchant_reference_mismatch" };
  }
  return { ok: true };
}
