export interface ReservationFinancialInput {
  total: number | string | null | undefined;
  depositRequired: number | string | null | undefined;
  paidToDate: number | string | null | undefined;
}

export interface ReservationFinancials {
  reservationTotal: number;
  depositRequired: number;
  paidToDate: number;
  outstanding: number;
  balanceDueAtCheckIn: number;
}

/**
 * Derives the reservation-facing financial presentation from the booking
 * contract and the atomic payment ledger summary.
 *
 * paidToDate is already net of recorded refunds by the payment RPC.
 * Check-in balance is the contracted amount remaining after the required
 * deposit allocation; it is deliberately not the live receivable.
 */
export function calculateReservationFinancials(
  input: ReservationFinancialInput,
): ReservationFinancials {
  const reservationTotal = Math.max(0, Number(input.total) || 0);
  const depositRequired = Math.min(
    reservationTotal,
    Math.max(0, Number(input.depositRequired) || 0),
  );
  const paidToDate = Math.min(
    reservationTotal,
    Math.max(0, Number(input.paidToDate) || 0),
  );

  return {
    reservationTotal,
    depositRequired,
    paidToDate,
    outstanding: Math.max(0, reservationTotal - paidToDate),
    balanceDueAtCheckIn: Math.max(0, reservationTotal - depositRequired),
  };
}
