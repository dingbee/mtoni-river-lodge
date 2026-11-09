export type ReconciliationProviderRow = {
  providerRef: string;
  amountMinor: string;
  currency: "TZS" | "USD";
  status: "successful" | "failed" | "cancelled" | "reversed";
};
export type ReconciliationInternalPayment = {
  id: string;
  providerTransactionRef: string | null;
  providerOrderRef: string | null;
  amountMinor: string;
  currency: "TZS" | "USD";
  status: "pending" | "successful" | "failed" | "cancelled" | "partially_reversed" | "reversed";
  allocatedMinor: string;
};
export type ReconciliationJsonValue = string | number | boolean | null | ReconciliationJsonValue[] | { [key: string]: ReconciliationJsonValue };

export type CommercialReconciliationResult = {
  itemType: "matched" | "missing_internal" | "missing_provider" | "duplicate" | "amount_mismatch" | "currency_mismatch" | "status_mismatch" | "unallocated" | "reversed";
  internalPaymentId: string | null;
  providerRef: string | null;
  expectedAmountMinor: string | null;
  observedAmountMinor: string | null;
  expectedCurrency: "TZS" | "USD" | null;
  observedCurrency: "TZS" | "USD" | null;
  evidence: Record<string, ReconciliationJsonValue>;
  resolutionStatus: "resolved" | "unresolved";
  resolutionRef: string | null;
};

function toMinor(value: string): bigint {
  if (!/^(0|[1-9]\d{0,19})$/.test(value)) {
    throw new Error("Reconciliation amount must be a non-negative integer minor-unit string.");
  }
  return BigInt(value);
}

/** Reconciles provider statements using exact integer arithmetic; it never mutates the ledger. */
export function reconcileCommercialProviderStatement(
  internal: readonly ReconciliationInternalPayment[],
  providerRows: readonly ReconciliationProviderRow[],
): CommercialReconciliationResult[] {
  const results: CommercialReconciliationResult[] = [];
  for (const payment of internal) {
    toMinor(payment.amountMinor);
    toMinor(payment.allocatedMinor);
  }
  const providerByRef = new Map<string, ReconciliationProviderRow[]>();
  for (const row of providerRows) {
    if (!row.providerRef.trim()) throw new Error("Provider statement row is invalid.");
    toMinor(row.amountMinor);
    const group = providerByRef.get(row.providerRef) ?? [];
    group.push(row);
    providerByRef.set(row.providerRef, group);
  }
  const internalByRef = new Map<string, ReconciliationInternalPayment>();
  for (const payment of internal) {
    for (const ref of [payment.providerTransactionRef, payment.providerOrderRef]) {
      if (ref) internalByRef.set(ref, payment);
    }
  }

  for (const [providerRef, rows] of providerByRef) {
    if (rows.length > 1) {
      results.push({
        itemType: "duplicate", internalPaymentId: internalByRef.get(providerRef)?.id ?? null,
        providerRef, expectedAmountMinor: null, observedAmountMinor: rows[0].amountMinor,
        expectedCurrency: null, observedCurrency: rows[0].currency,
        evidence: { duplicateCount: rows.length, providerRows: rows },
        resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    const observed = rows[0];
    const payment = internalByRef.get(providerRef);
    if (!payment) {
      results.push({
        itemType: "missing_internal", internalPaymentId: null, providerRef,
        expectedAmountMinor: null, observedAmountMinor: observed.amountMinor,
        expectedCurrency: null, observedCurrency: observed.currency,
        evidence: { providerRow: observed }, resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    if (payment.currency !== observed.currency) {
      results.push({
        itemType: "currency_mismatch", internalPaymentId: payment.id, providerRef,
        expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
        expectedCurrency: payment.currency, observedCurrency: observed.currency,
        evidence: { internalPayment: payment, providerRow: observed },
        resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    if (toMinor(payment.amountMinor) !== toMinor(observed.amountMinor)) {
      results.push({
        itemType: "amount_mismatch", internalPaymentId: payment.id, providerRef,
        expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
        expectedCurrency: payment.currency, observedCurrency: observed.currency,
        evidence: { internalPayment: payment, providerRow: observed },
        resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    if (payment.status === "reversed" && observed.status === "reversed") {
      results.push({
        itemType: "reversed", internalPaymentId: payment.id, providerRef,
        expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
        expectedCurrency: payment.currency, observedCurrency: observed.currency,
        evidence: { internalPayment: payment, providerRow: observed },
        resolutionStatus: "resolved", resolutionRef: "reversal_state_matched",
      });
      continue;
    }
    if (payment.status !== observed.status) {
      results.push({
        itemType: "status_mismatch", internalPaymentId: payment.id, providerRef,
        expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
        expectedCurrency: payment.currency, observedCurrency: observed.currency,
        evidence: { internalPayment: payment, providerRow: observed },
        resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    if (payment.status === "successful" && toMinor(payment.allocatedMinor) === 0n) {
      results.push({
        itemType: "unallocated", internalPaymentId: payment.id, providerRef,
        expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
        expectedCurrency: payment.currency, observedCurrency: observed.currency,
        evidence: { internalPayment: payment, providerRow: observed },
        resolutionStatus: "unresolved", resolutionRef: null,
      });
      continue;
    }
    results.push({
      itemType: "matched", internalPaymentId: payment.id, providerRef,
      expectedAmountMinor: payment.amountMinor, observedAmountMinor: observed.amountMinor,
      expectedCurrency: payment.currency, observedCurrency: observed.currency,
      evidence: { internalPayment: payment, providerRow: observed },
      resolutionStatus: "resolved", resolutionRef: "exact_match",
    });
  }

  for (const payment of internal) {
    const refs = [payment.providerTransactionRef, payment.providerOrderRef].filter((ref): ref is string => Boolean(ref));
    if (refs.some((ref) => providerByRef.has(ref))) continue;
    const ref = payment.providerTransactionRef ?? payment.providerOrderRef;
    if (payment.status === "pending" || payment.status === "failed" || payment.status === "cancelled") continue;
    results.push({
      itemType: "missing_provider", internalPaymentId: payment.id, providerRef: ref,
      expectedAmountMinor: payment.amountMinor, observedAmountMinor: null,
      expectedCurrency: payment.currency, observedCurrency: null,
      evidence: { internalPayment: payment },
      resolutionStatus: "unresolved", resolutionRef: null,
    });
  }
  return results;
}
