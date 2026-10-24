import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPesapalTransactionStatus, classifyStatus } from "./pesapal.server";

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
 * - On success: generates invoice_number, sets confirmed_at, sends email.
 */
export async function verifyAndFinalizePayment(opts: {
  bookingId: string;
  orderTrackingId: string;
  source: "ipn" | "status_check";
}): Promise<{ outcome: FinalizeOutcome; paymentMethod: string | null }> {
  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, reference, payment_status, status, deposit_amount, currency, invoice_number, pesapal_merchant_reference")
    .eq("id", opts.bookingId)
    .maybeSingle();
  if (!booking) return { outcome: "pending", paymentMethod: null };

  if (
    booking.payment_status === "paid" ||
    booking.payment_status === "deposit_paid"
  ) {
    return { outcome: "already_finalized", paymentMethod: null };
  }

  const status = await getPesapalTransactionStatus(opts.orderTrackingId);

  // Provider status must refer to the merchant order stored on this booking.
  // A valid tracking ID alone is insufficient to authorize a financial state change.
  if (
    !booking.pesapal_merchant_reference ||
    !status.merchant_reference ||
    status.merchant_reference !== booking.pesapal_merchant_reference
  ) {
    await supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
      provider: "pesapal",
      event_type: "security:merchant_reference_mismatch",
      order_tracking_id: opts.orderTrackingId,
      merchant_reference: status.merchant_reference ?? null,
      amount: status.amount ?? null,
      currency: status.currency ?? null,
      raw: JSON.parse(JSON.stringify({
        expectedMerchantReference: booking.pesapal_merchant_reference,
        receivedMerchantReference: status.merchant_reference ?? null,
      })),
    });
    console.error("[pesapal] merchant reference mismatch; refusing finalization", {
      bookingId: booking.id,
      reference: booking.reference,
      orderTrackingId: opts.orderTrackingId,
    });
    return { outcome: "mismatch", paymentMethod: null };
  }

  const outcome = classifyStatus(status.status_code);
  const paymentMethod = status.payment_method ?? null;

  await supabaseAdmin.from("payment_events").insert({
    booking_id: booking.id,
    provider: "pesapal",
    event_type: `${opts.source}:${outcome}`,
    order_tracking_id: opts.orderTrackingId,
    status_code: status.status_code ?? null,
    payment_method: paymentMethod,
    amount: status.amount ?? null,
    currency: status.currency ?? null,
    raw: JSON.parse(JSON.stringify(status)),
  });

  if (outcome === "failed" || outcome === "reversed") {
    await supabaseAdmin
      .from("bookings")
      .update({ payment_failed_at: new Date().toISOString() })
      .eq("id", booking.id);
    return { outcome, paymentMethod };
  }

  if (outcome !== "completed") {
    return { outcome, paymentMethod };
  }

  // === Strict amount verification ===
  const expected = Number(booking.deposit_amount);
  const paid = Number(status.amount ?? 0);
  const amountsMatch = Math.round(expected * 100) === Math.round(paid * 100);
  const currencyMatches =
    !status.currency || status.currency.toUpperCase() === (booking.currency || "USD").toUpperCase();

  if (!amountsMatch || !currencyMatches) {
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "payment_mismatch",
        payment_mismatch_at: nowIso,
        paid_amount: paid,
        payment_method: paymentMethod,
      })
      .eq("id", booking.id);
    await supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
      provider: "pesapal",
      event_type: "security:payment_mismatch",
      order_tracking_id: opts.orderTrackingId,
      amount: paid,
      currency: status.currency ?? null,
      raw: {
        expectedAmount: expected,
        paidAmount: paid,
        expectedCurrency: booking.currency,
        paidCurrency: status.currency,
      },
    });
    console.error(
      `PAYMENT MISMATCH booking=${booking.reference} expected=${expected} ${booking.currency} paid=${paid} ${status.currency}`,
    );
    return { outcome: "mismatch", paymentMethod };
  }

  // Valid payment — confirm booking, mint invoice number.
  const nowIso = new Date().toISOString();
  const invoiceNumber = booking.invoice_number ?? makeInvoiceNumber(booking.reference);

  await supabaseAdmin
    .from("bookings")
    .update({
      payment_status: "deposit_paid",
      status: "confirmed",
      payment_method: paymentMethod,
      payment_completed_at: nowIso,
      confirmed_at: nowIso,
      paid_amount: paid,
      invoice_number: invoiceNumber,
    })
    .eq("id", booking.id)
    .neq("payment_status", "deposit_paid")
    .neq("payment_status", "paid");

  try {
    const { sendBookingConfirmedEmail } = await import("./booking-confirmation-email.server");
    const r = await sendBookingConfirmedEmail(booking.id);
    if (!r.ok) console.error("confirmation email failed:", "error" in r ? r.error : "unknown");
  } catch (e) {
    console.error("confirmation email error:", e);
  }

  return { outcome: "completed", paymentMethod };
}