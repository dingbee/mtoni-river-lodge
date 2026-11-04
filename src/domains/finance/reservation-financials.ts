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
 * Derives reservation presentation from the contracted booking value,
 * required deposit policy, and the payment summary maintained by the
 * existing atomic payment ledger. The check-in balance is not the live
 * receivable.
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
