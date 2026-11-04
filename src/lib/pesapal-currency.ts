/**
 * Resolve a provider settlement currency only when both the provider response
 * and the booking carry an explicit, matching ISO currency code.
 *
 * Missing provider currency must never inherit the booking currency: that
 * would allow an unverifiable Pesapal settlement to be finalized.
 */
export function resolvePesapalSettlementCurrency(
  providerCurrency: string | null | undefined,
  bookingCurrency: string | null | undefined,
): string | null {
  const provider = providerCurrency?.trim().toUpperCase();
  const booking = bookingCurrency?.trim().toUpperCase();

  if (!provider || !booking || provider !== booking) return null;
  return provider;
}
