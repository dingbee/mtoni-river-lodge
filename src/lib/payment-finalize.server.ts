import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { getPesapalPropertyAccountTransactionStatus, classifyStatus } from "./pesapal.server";
import { getPropertyPesapalAccountForSettlement, readPropertyPesapalCredentials } from "./property-pesapal-account.server";
import { resolvePesapalSettlementCurrency } from "./pesapal-currency";


type FinalizeRpcResult = Promise<{
  data: { ok: boolean; duplicate: boolean } | null;
  error: { message: string; code?: string } | null;
}>;

interface PaymentFinalizeRpcClient {
  rpc(
    fn: "finalize_pesapal_payment",
    args: {
      _booking_id: string;
      _order_tracking_id: string;
      _amount: number;
      _currency: string;
      _method: string | null;
      _source: "ipn" | "status_check";
      _invoice_number: string;
      _raw: Json;
    },
  ): FinalizeRpcResult;
  rpc(
    fn: "finalize_pesapal_reversal",
    args: {
      _booking_id: string;
      _order_tracking_id: string;
      _amount: number;
      _currency: string;
      _source: "ipn" | "status_check";
      _raw: Json;
    },
  ): FinalizeRpcResult;
}

const paymentFinalizeRpc = supabaseAdmin as unknown as PaymentFinalizeRpcClient;

export type FinalizeOutcome =
  | "pending"
  | "completed"
  | "failed"
  | "reversed"
  | "mismatch"
  | "already_finalized";

function makeInvoiceNumber(reference: string) {
  const ts = new Date();
  const yy = ts.getUTCFullYear().toString().slice(-2);
  const mm = String(ts.getUTCMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).slice(-4).toUpperCase();
  return `INV-${yy}${mm}-${reference.replace(/^MR-/, "")}-${rand}`;
}

/**
 * Verifies the Pesapal transaction for a booking and finalizes it.
 * - Requires paid amount to match stored deposit exactly (cent-level).
 *   Mismatch => booking moves to payment_mismatch and is NOT confirmed.
 * - Requires an explicit provider currency matching the booking currency.
 * - On success: generates invoice_number, sets confirmed_at, sends email.
 */
export async function verifyAndFinalizePayment(opts: {
  bookingId: string;
  orderTrackingId: string;
  source: "ipn" | "status_check";
}): Promise<{ outcome: FinalizeOutcome; paymentMethod: string | null }> {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, reference, payment_status, status, deposit_amount, total, paid_amount, currency, invoice_number, pesapal_order_tracking_id, payment_provider_account_id, property_id")
    .eq("id", opts.bookingId)
    .eq("pesapal_order_tracking_id", opts.orderTrackingId)
    .maybeSingle();
  if (bookingError) throw new Error(`Unable to load booking for Pesapal finalization: ${bookingError.message}`);
  if (!booking) return { outcome: "pending", paymentMethod: null };

  if (!booking.payment_provider_account_id) {
    throw new Error("Booking has no property-scoped Pesapal account. Platform credentials are not used as a fallback.");
  }
  const providerAccount = await getPropertyPesapalAccountForSettlement(
    supabaseAdmin,
    booking.payment_provider_account_id,
    booking.property_id,
    booking.currency,
  );
  const providerCredentials = await readPropertyPesapalCredentials(supabaseAdmin, providerAccount.credential_secret_ref);

  // Always re-query the exact property account that initiated this order. A completed
  // settlement can later be reversed; never substitute platform/global credentials.
  const status = await getPesapalPropertyAccountTransactionStatus(
    opts.orderTrackingId,
    providerCredentials,
    providerAccount.environment,
  );
  const outcome = classifyStatus(status.status_code);
  const paymentMethod = status.payment_method ?? null;
  const raw = JSON.parse(JSON.stringify(status)) as Json;

  if (outcome === "completed") {
    const expected = Number(booking.deposit_amount);
    const paid = Number(status.amount ?? 0);
    const amountsMatch = Math.round(expected * 100) === Math.round(paid * 100);
    const currency = resolvePesapalSettlementCurrency(status.currency, booking.currency);

    if (!amountsMatch || currency === null) {
      const nowIso = new Date().toISOString();
      const { error: eventError } = await supabaseAdmin.from("payment_events").insert({
        booking_id: booking.id,
        provider_account_id: providerAccount.id,
        provider: "pesapal",
        event_type: `${opts.source}:completed`,
        order_tracking_id: opts.orderTrackingId,
        status_code: status.status_code ?? null,
        payment_method: paymentMethod,
        amount: paid,
        currency: status.currency ?? null,
        raw,
      });
      if (eventError) throw new Error(`Unable to record Pesapal mismatch event: ${eventError.message}`);

      const { error: bookingUpdateError } = await supabaseAdmin
        .from("bookings")
        .update({
          payment_status: "payment_mismatch",
          payment_mismatch_at: nowIso,
        })
        .eq("id", booking.id);
      if (bookingUpdateError) throw new Error(`Unable to mark Pesapal payment mismatch: ${bookingUpdateError.message}`);

      const { error: mismatchEventError } = await supabaseAdmin.from("payment_events").insert({
        booking_id: booking.id,
        provider: "pesapal",
        event_type: "security:payment_mismatch",
        order_tracking_id: opts.orderTrackingId,
        status_code: status.status_code ?? null,
        amount: paid,
        currency: status.currency ?? null,
        raw: {
          expectedAmount: expected,
          paidAmount: paid,
          expectedCurrency: booking.currency,
          paidCurrency: status.currency,
        },
      });
      if (mismatchEventError) throw new Error(`Unable to record Pesapal mismatch audit event: ${mismatchEventError.message}`);
      console.error(
        `PAYMENT MISMATCH booking=${booking.reference} expected=${expected} ${booking.currency} paid=${paid} ${status.currency}`,
      );
      return { outcome: "mismatch", paymentMethod };
    }

    const invoiceNumber = booking.invoice_number ?? makeInvoiceNumber(booking.reference);
    const { data: result, error: finalizeError } = await paymentFinalizeRpc.rpc(
      "finalize_pesapal_payment",
      {
        _booking_id: booking.id,
        _order_tracking_id: opts.orderTrackingId,
        _amount: paid,
        _currency: currency,
        _method: paymentMethod,
        _source: opts.source,
        _invoice_number: invoiceNumber,
        _raw: raw,
      },
    );
    if (finalizeError) throw new Error(`Unable to finalize Pesapal settlement: ${finalizeError.message}`);
    if (!result?.ok) throw new Error("Pesapal settlement transaction did not complete");
    return { outcome: result.duplicate ? "already_finalized" : "completed", paymentMethod };
  }

  if (outcome === "reversed") {
    const { data: reversalResult, error: reversalError } = await paymentFinalizeRpc.rpc(
      "finalize_pesapal_reversal",
      {
        _booking_id: booking.id,
        _order_tracking_id: opts.orderTrackingId,
        _amount: Number(status.amount ?? 0),
        _currency: status.currency ?? "",
        _source: opts.source,
        _raw: raw,
      },
    );
    if (reversalError) throw new Error(`Unable to finalize Pesapal reversal: ${reversalError.message}`);
    if (!reversalResult?.ok) throw new Error("Pesapal reversal transaction did not complete");
    return { outcome: reversalResult.duplicate ? "already_finalized" : "reversed", paymentMethod };
  }

  const { error: eventError } = await supabaseAdmin.from("payment_events").insert({
    booking_id: booking.id,
    provider_account_id: providerAccount.id,
    provider: "pesapal",
    event_type: `${opts.source}:${outcome}`,
    order_tracking_id: opts.orderTrackingId,
    status_code: status.status_code ?? null,
    payment_method: paymentMethod,
    amount: status.amount ?? null,
    currency: status.currency ?? null,
    raw,
  });
  if (eventError) throw new Error(`Unable to record Pesapal status event: ${eventError.message}`);

  if (
    outcome === "failed" &&
    booking.payment_status !== "paid" &&
    booking.payment_status !== "deposit_paid"
  ) {
    const { error: failedUpdateError } = await supabaseAdmin
      .from("bookings")
      .update({ payment_failed_at: new Date().toISOString() })
      .eq("id", booking.id);
    if (failedUpdateError) throw new Error(`Unable to update failed Pesapal payment status: ${failedUpdateError.message}`);
  }

  return { outcome, paymentMethod };
}
