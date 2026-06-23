import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Check, AlertTriangle } from "lucide-react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooterMinimal } from "@/components/site/SiteFooterMinimal";
import { getPaymentStatusByReference } from "@/lib/payments.functions";
import { trackGAEvent, trackBookingCompleted } from "@/lib/analytics";

type Search = { ref?: string; email?: string };
type PaymentStatus = Awaited<ReturnType<typeof getPaymentStatusByReference>>;

export const Route = createFileRoute("/booking/return")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    ref: typeof s.ref === "string" ? s.ref : undefined,
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  head: () => ({ meta: [{ title: "Payment status — Mtoni River Lodge" }, { name: "robots", content: "noindex" }] }),
  component: BookingReturn,
});

function BookingReturn() {
  const { ref, email: emailFromUrl } = Route.useSearch();
  const [email, setEmail] = useState(emailFromUrl ?? "");
  const [status, setStatus] = useState<PaymentStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [polls, setPolls] = useState(0);

  const checkFn = useServerFn(getPaymentStatusByReference);

  const fetchStatus = useMemo(() => async (e: string) => {
    if (!ref || !e) return;
    setLoading(true);
    setError(null);
    try {
      const res = await checkFn({ data: { reference: ref, email: e } });
      setStatus(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch status");
    } finally {
      setLoading(false);
    }
  }, [ref, checkFn]);

  useEffect(() => {
    if (emailFromUrl && ref) fetchStatus(emailFromUrl);
  }, [emailFromUrl, ref, fetchStatus]);

  // Poll up to 10x while pending.
  useEffect(() => {
    if (!status || polls >= 10) return;
    const isFinal =
      status.paymentStatus === "deposit_paid" ||
      status.paymentStatus === "paid" ||
      status.paymentStatus === "payment_mismatch" ||
      status.outcome === "failed" ||
      status.outcome === "mismatch";
    if (isFinal) return;
    const t = setTimeout(() => {
      setPolls((n) => n + 1);
      fetchStatus(email);
    }, 3000);
    return () => clearTimeout(t);
  }, [status, polls, email, fetchStatus]);

  useEffect(() => {
    if (!status) return;
    if (status.paymentStatus === "deposit_paid" || status.paymentStatus === "paid") {
      trackGAEvent("payment_success", {
        currency: status.currency,
        value: status.deposit,
        transaction_id: ref,
        booking_value: status.deposit,
      });
      trackGAEvent("booking_confirmed", { transaction_id: ref });
      trackBookingCompleted({
        reference: ref,
        value: status.deposit,
        currency: status.currency,
        payment_method: status.paymentMethod ?? undefined,
      });
    } else if (status.outcome === "failed") {
      trackGAEvent("payment_failed", { transaction_id: ref });
    }
  }, [status, ref]);

  const fmt = (n: number, c: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(n);

  return (
    <div className="bg-ivory text-charcoal">
      <SiteHeader />
      <main className="mx-auto w-full max-w-xl px-4 py-20 lg:py-28">
        <h1 className="font-display text-3xl">Payment status</h1>
        {!ref && <p className="mt-3 text-sm text-rose-700">Missing booking reference in URL.</p>}

        {ref && !emailFromUrl && !status && (
          <form
            onSubmit={(e) => { e.preventDefault(); fetchStatus(email); }}
            className="mt-6 space-y-4 rounded-2xl border border-charcoal/10 bg-ivory p-6"
          >
            <p className="text-sm text-charcoal/70">
              Booking <span className="font-mono">{ref}</span> — enter your email to check the payment status.
            </p>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-charcoal/15 px-4 py-3 text-sm outline-none focus:border-charcoal"
            />
            <button className="w-full rounded-full bg-charcoal px-5 py-3 text-[0.7rem] uppercase tracking-[0.24em] text-ivory">
              Check status
            </button>
          </form>
        )}

        {loading && !status && (
          <div className="mt-6 flex items-center gap-2 text-sm text-charcoal/70">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking with Pesapal…
          </div>
        )}
        {error && <p className="mt-4 text-sm text-rose-700">{error}</p>}

        {status && (
          <div className="mt-6 rounded-2xl border border-charcoal/10 bg-ivory p-6">
            {(status.paymentStatus === "deposit_paid" || status.paymentStatus === "paid") ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#427A43]/10">
                  <Check className="h-7 w-7" style={{ color: "#346739" }} />
                </div>
                <h2 className="mt-4 font-display text-2xl">Payment received</h2>
                <p className="mt-2 text-sm text-charcoal/70">Your booking is confirmed. We have emailed your receipt to {email}.</p>
              </div>
            ) : status.outcome === "failed" ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100">
                  <AlertTriangle className="h-7 w-7 text-rose-700" />
                </div>
                <h2 className="mt-4 font-display text-2xl">Payment failed</h2>
                <p className="mt-2 text-sm text-charcoal/70">No charge was made. You can retry from your confirmation email or contact us.</p>
              </div>
            ) : (status.paymentStatus === "payment_mismatch" || status.outcome === "mismatch") ? (
              <div className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                  <AlertTriangle className="h-7 w-7 text-amber-700" />
                </div>
                <h2 className="mt-4 font-display text-2xl">Payment under review</h2>
                <p className="mt-2 text-sm text-charcoal/70">
                  The amount received doesn't match this booking's deposit. Our team has been notified and will contact you shortly to resolve this.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-3 text-sm text-charcoal/70">
                <Loader2 className="h-4 w-4 animate-spin" /> Awaiting confirmation from Pesapal… ({polls + 1}/10)
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-bone/40 p-4 text-sm">
              <span className="text-charcoal/60">Reference</span><span className="text-right font-mono">{status.reference}</span>
              <span className="text-charcoal/60">Deposit (50%)</span><span className="text-right">{fmt(status.deposit, status.currency)}</span>
              <span className="text-charcoal/60">Balance at check-in</span><span className="text-right">{fmt(status.balance, status.currency)}</span>
              <span className="font-display">Total</span><span className="text-right font-display">{fmt(status.total, status.currency)}</span>
              {status.paymentMethod && (<><span className="text-charcoal/60">Method</span><span className="text-right">{status.paymentMethod}</span></>)}
            </div>

            <div className="mt-6 flex justify-center">
              <Link to="/" className="text-xs uppercase tracking-[0.24em] text-charcoal/70 underline-offset-4 hover:underline">Back to home</Link>
            </div>
          </div>
        )}
      </main>
      <SiteFooterMinimal />
    </div>
  );
}