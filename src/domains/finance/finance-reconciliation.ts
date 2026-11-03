export type ReconciliationEvent = {
  id: string;
  booking_id: string | null;
  event_type: string;
  amount: number | string | null;
  currency?: string | null;
};

export type ReconciliationBooking = {
  id: string;
  paid_amount: number | string | null;
  balance_amount: number | string | null;
  total: number | string | null;
  currency: string;
};

const CREDIT_EVENT_TYPES = new Set(["payment_completed", "manual_payment", "adjustment"]);
const REFUND_EVENT_TYPES = new Set(["refund", "refund_issued"]);

/**
 * Only events that represent an actual ledger movement affect the paid total.
 * Provider status notifications (including ipn:reversed) are deliberately
 * excluded: a status callback is not proof that money was refunded.
 */
export function getReconciliationEventAmount(event: ReconciliationEvent): number | null {
  const amount = Number(event.amount ?? 0);
  if (!Number.isFinite(amount)) return null;

  if (CREDIT_EVENT_TYPES.has(event.event_type)) return amount;
  if (REFUND_EVENT_TYPES.has(event.event_type)) {
    return amount > 0 ? -amount : amount;
  }
  return null;
}

export function reconcileBookingLedger(
  booking: ReconciliationBooking,
  events: ReconciliationEvent[],
) {
  const bookingEvents = events.filter((event) => event.booking_id === booking.id);
  const recognizedEvents = bookingEvents
    .map((event) => ({ event, signedAmount: getReconciliationEventAmount(event) }))
    .filter((item): item is { event: ReconciliationEvent; signedAmount: number } =>
      item.signedAmount !== null,
    );

  const eventTotal = Math.round(
    recognizedEvents.reduce((sum, item) => sum + item.signedAmount, 0) * 100,
  ) / 100;
  const paidAmount = Number(booking.paid_amount ?? 0);
  const balanceAmount = Number(booking.balance_amount ?? 0);
  const total = Number(booking.total ?? 0);
  const variance = Math.round((eventTotal - paidAmount) * 100) / 100;
  const derivedBalance = Math.max(0, Math.round((total - paidAmount) * 100) / 100);

  const recognizedCurrencies = recognizedEvents.map(({ event }) => event.currency?.toUpperCase());
  const currencies = new Set(
    recognizedCurrencies.filter((currency): currency is string => Boolean(currency)),
  );
  const currencyMismatch =
    recognizedCurrencies.some((currency) => !currency) ||
    [...currencies].some((currency) => currency !== booking.currency.toUpperCase());

  return {
    events_total: eventTotal,
    variance,
    derived_balance: derivedBalance,
    balance_variance: Math.round((balanceAmount - derivedBalance) * 100) / 100,
    recognized_event_count: recognizedEvents.length,
    ignored_event_count: bookingEvents.length - recognizedEvents.length,
    currency_mismatch: currencyMismatch,
    matched:
      Math.abs(variance) < 0.01 &&
      Math.abs(balanceAmount - derivedBalance) < 0.01 &&
      !currencyMismatch,
  };
}
