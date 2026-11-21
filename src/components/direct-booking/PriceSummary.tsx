import { formatMoney } from "@/lib/money";
import { reconcileQuote, type QuoteAmounts, type SearchedPlanAmounts } from "@/lib/booking-economics";

/**
 * Guest-facing price summary for the selected room (the nightly breakdown sits
 * above it). Before the final quote it shows the accommodation total from the
 * search; once the server quote arrives it shows every component of the payable
 * total. Only components that apply are listed; nothing is defaulted to zero.
 */
export function PriceSummary({ plan, roomName, maxOccupancy, nights, guests, quote, quoteLoading, quoteError, currency }: {
  plan: SearchedPlanAmounts | undefined;
  roomName: string;
  maxOccupancy?: number | null;
  nights: number;
  guests: number;
  quote: QuoteAmounts | null;
  quoteLoading: boolean;
  quoteError: string;
  currency: string;
}) {
  const code = quote?.currency ?? plan?.currency ?? currency;
  const fmt = (value: number) => formatMoney(value, code);
  const reconciliation = quote && plan ? reconcileQuote(plan, quote) : null;

  return <div className="mt-4 rounded-xl border border-[var(--direct-border)] bg-[var(--direct-surface)] p-4 text-xs text-[var(--direct-text-subtle)]">
    <div className="flex items-center justify-between gap-3">
      <span className="font-semibold text-[var(--direct-text)]">Price summary</span>
      <span className="text-[11px] text-[var(--direct-muted)]">{quoteLoading ? "Calculating final price…" : quote?.quote_expires_at ? `Final price valid until ${new Date(quote.quote_expires_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Before taxes and fees"}</span>
    </div>

    <p className="mt-2 text-[11px] text-[var(--direct-muted)]">{roomName} · {guests} {guests === 1 ? "guest" : "guests"}{maxOccupancy ? ` (sleeps up to ${maxOccupancy})` : ""} · {nights} {nights === 1 ? "night" : "nights"}</p>


    {!quote && plan && <div className="mt-3 flex justify-between gap-3 border-t border-[var(--direct-border)] pt-3 text-sm font-semibold text-[var(--direct-text)]"><span>Accommodation</span><span>{fmt(Number(plan.total))}</span></div>}

    {quote && <div className="mt-3 space-y-1.5 border-t border-[var(--direct-border)] pt-3">
      <Line label={Number(quote.discount_total) > 0 ? "Accommodation before discount" : "Accommodation"} value={fmt(Number(quote.accommodation_subtotal))} />
      {Number(quote.discount_total) > 0 && <Line label="Discount" value={`−${fmt(Number(quote.discount_total))}`} emphasis />}
      {Number(quote.extras_total) > 0 && <Line label="Extras" value={fmt(Number(quote.extras_total))} />}
      {Number(quote.fee_total) > 0 && <Line label="Fees" value={fmt(Number(quote.fee_total))} />}
      {Number(quote.tax_addition) > 0 && <Line label="Taxes" value={fmt(Number(quote.tax_addition))} />}
      {Number(quote.taxes) > 0 && <p className="text-[11px] text-[var(--direct-muted)]">Prices include taxes of {fmt(Number(quote.taxes))}.</p>}
      {reconciliation?.noAdditionalCharges && <p className="text-[11px] text-[var(--direct-muted)]">No additional taxes or fees apply.</p>}
      <div className="flex justify-between gap-3 border-t border-[var(--direct-border)] pt-2.5 text-sm font-semibold text-[var(--direct-text)]"><span>Total</span><span>{fmt(Number(quote.total))}</span></div>
    </div>}

    {reconciliation && !reconciliation.matches && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-[11px] text-red-800">
      The price changed after your search: accommodation was {fmt(reconciliation.searched)}, it is now {fmt(reconciliation.quoted)}. Search again to see current rates before requesting this reservation.
    </p>}
    {!quote && !quoteLoading && <p className="mt-2 text-[11px] text-[var(--direct-muted)]">Enter your email address to confirm any taxes, fees and the final total.</p>}
    {quoteError && <p role="alert" className="mt-2 text-[11px] text-red-700">{quoteError}</p>}
  </div>;
}

function Line({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return <div className={`flex justify-between gap-3 ${emphasis ? "font-medium text-[var(--direct-on-primary-soft)]" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
