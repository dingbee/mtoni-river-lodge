export type RevenueLedgerEvent = {
  event_type: string;
  amount: number | string | null;
  currency: string | null;
};

export type CurrencyRevenueLedger = {
  currency: string;
  cashCollected: number;
  refunds: number;
  providerReversals: number;
  netCashReceived: number;
  successfulCollections: number;
  refundEvents: number;
  reversalEvents: number;
};

const COLLECTION_EVENTS = new Set(["manual_payment", "payment_completed"]);
const REFUND_EVENTS = new Set(["refund"]);
const REVERSAL_EVENTS = new Set(["provider_reversal"]);

export function aggregateRevenueLedger(events: RevenueLedgerEvent[]): CurrencyRevenueLedger[] {
  const byCurrency = new Map<string, CurrencyRevenueLedger>();
  for (const event of events) {
    const isCollection = COLLECTION_EVENTS.has(event.event_type);
    const isRefund = REFUND_EVENTS.has(event.event_type);
    const isReversal = REVERSAL_EVENTS.has(event.event_type);
    if (!isCollection && !isRefund && !isReversal) continue;

    const amount = Number(event.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const currency = (event.currency ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
    const row = byCurrency.get(currency) ?? {
      currency, cashCollected: 0, refunds: 0, providerReversals: 0,
      netCashReceived: 0, successfulCollections: 0, refundEvents: 0, reversalEvents: 0,
    };
    if (isCollection) {
      if (amount < 0) continue;
      row.cashCollected += amount;
      row.successfulCollections += 1;
    } else if (isRefund) {
      if (amount > 0) continue;
      row.refunds += Math.abs(amount);
      row.refundEvents += 1;
    } else {
      if (amount > 0) continue;
      row.providerReversals += Math.abs(amount);
      row.reversalEvents += 1;
    }
    byCurrency.set(currency, row);
  }
  return [...byCurrency.values()].map((row) => ({
    ...row,
    netCashReceived: row.cashCollected - row.refunds - row.providerReversals,
  })).sort((a, b) => a.currency.localeCompare(b.currency));
}
