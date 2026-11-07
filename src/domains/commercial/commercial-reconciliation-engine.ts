export type ReconciliationProviderRow = {
  providerRef: string;
  amountMinor: number;
  currency: "TZS" | "USD";
  status: "successful" | "failed" | "cancelled" | "reversed";
};
export type ReconciliationInternalPayment = {
  id: string;
  providerTransactionRef: string | null;
  providerOrderRef: string | null;
  amountMinor: number;
  currency: "TZS" | "USD";
  status: "pending" | "successful" | "failed" | "cancelled" | "partially_reversed" | "reversed";
  allocatedMinor: number;
};
export type CommercialReconciliationResult = {
  itemType: "matched" | "missing_internal" | "missing_provider" | "duplicate" | "amount_mismatch" | "currency_mismatch" | "status_mismatch" | "unallocated" | "reversed";
  internalPaymentId: string | null;
  providerRef: string | null;
  expectedAmountMinor: number | null;
  observedAmountMinor: number | null;
  expectedCurrency: "TZS" | "USD" | null;
  observedCurrency: "TZS" | "USD" | null;
  evidence: Record<string, unknown>;
  resolutionStatus: "resolved" | "unresolved";
  resolutionRef: string | null;
};

/** Reconciles a provider statement against internal payment evidence without changing the ledger. */
export function reconcileCommercialProviderStatement(
  internal: readonly ReconciliationInternalPayment[],
  providerRows: readonly ReconciliationProviderRow[],
): CommercialReconciliationResult[] {
  const results: CommercialReconciliationResult[] = [];
  const providerByRef = new Map<string, ReconciliationProviderRow[]>();
  for (const row of providerRows) {
    if (!row.providerRef.trim() || !Number.isSafeInteger(row.amountMinor) || row.amountMinor < 0) {
      throw new Error("Provider statement row is invalid.");
    }
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
    if (payment.amountMinor !== observed.amountMinor) {
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
    if (payment.status === "successful" && payment.allocatedMinor === 0) {
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
