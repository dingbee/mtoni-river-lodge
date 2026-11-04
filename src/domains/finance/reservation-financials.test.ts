import { describe, expect, it } from "vitest";
import { calculateReservationFinancials } from "./reservation-financials";

describe("calculateReservationFinancials", () => {
  it("keeps the contracted check-in balance separate from live outstanding", () => {
    const result = calculateReservationFinancials({
      total: 1000,
      depositRequired: 300,
      paidToDate: 450,
    });

    expect(result).toEqual({
      reservationTotal: 1000,
      depositRequired: 300,
      paidToDate: 450,
      outstanding: 550,
      balanceDueAtCheckIn: 700,
    });
  });

  it("calculates the check-in balance from the deposit policy, not the unpaid amount", () => {
    const result = calculateReservationFinancials({
      total: 1000,
      depositRequired: 300,
      paidToDate: 300,
    });

    expect(result.outstanding).toBe(700);
    expect(result.balanceDueAtCheckIn).toBe(700);
  });

  it("uses net paid to date after refunds", () => {
    const result = calculateReservationFinancials({
      total: 1000,
      depositRequired: 300,
      paidToDate: 250,
    });

    expect(result.outstanding).toBe(750);
    expect(result.balanceDueAtCheckIn).toBe(700);
  });

  it("clamps negative and over-contract values safely", () => {
    const result = calculateReservationFinancials({
      total: 1000,
      depositRequired: 1200,
      paidToDate: 1400,
    });

    expect(result.depositRequired).toBe(1000);
    expect(result.paidToDate).toBe(1000);
    expect(result.outstanding).toBe(0);
    expect(result.balanceDueAtCheckIn).toBe(0);
  });
});
