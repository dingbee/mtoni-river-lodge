import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveBookingPaymentContext } from "./payment-context.server";
import { getPaymentProvider } from "./payment-providers.server";

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

export async function verifyAndFinalizePayment(opts: {
  bookingId: string;
  orderTrackingId: string;
  source: "ipn" | "status_check";
  expectedPropertyId?: string;
}): Promise<{ outcome: FinalizeOutcome; paymentMethod: string | null }> {
  const { data: booking, error } = await (supabaseAdmin as any)
    .from("bookings")
    .select("id, reference, property_id, payment_status, status, deposit_amount, currency, invoice_number, payment_provider, payment_integration_id, provider_transaction_id, provider_merchant_reference, pesapal_merchant_reference")
    .eq("id", opts.bookingId)
    .maybeSingle();
  if (error) throw new Error(`Could not load booking for payment finalization: ${error.message}`);
  if (!booking) return { outcome: "pending", paymentMethod: null };
  if (opts.expectedPropertyId && booking.property_id !== opts.expectedPropertyId) {
    throw new Error("Payment callback tenant does not match booking tenant");
  }
  if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") {
    return { outcome: "already_finalized", paymentMethod: null };
  }

  const provider = String(booking.payment_provider ?? "").toLowerCase();
  const integrationId = booking.payment_integration_id as string | null;
  const storedTransactionId = booking.provider_transaction_id ?? booking.pesapal_order_tracking_id;
  const expectedMerchantReference = booking.provider_merchant_reference ?? booking.pesapal_merchant_reference;
  if (!provider || !integrationId || !storedTransactionId || storedTransactionId !== opts.orderTrackingId) {
    await (supabaseAdmin as any).from("payment_events").insert({
      booking_id: booking.id,
      property_id: booking.property_id,
      integration_id: integrationId,
      provider: provider || "unknown",
      event_type: "security:payment_context_mismatch",
      provider_transaction_id: opts.orderTrackingId,
      raw: { expectedTransactionId: storedTransactionId, receivedTransactionId: opts.orderTrackingId },
    });
    return { outcome: "mismatch", paymentMethod: null };
  }

  const { data: integration, error: integrationError } = await (supabaseAdmin as any)
    .from("staynas_property_integrations")
    .select("provider, enabled, property_id")
    .eq("id", integrationId)
    .maybeSingle();
  if (integrationError) throw new Error(integrationError.message);
  if (!integration || integration.property_id !== booking.property_id || !integration.enabled ||
      String(integration.provider).toLowerCase() !== provider) {
    throw new Error("Payment integration is disabled or does not belong to the booking tenant");
  }

  const { data: property } = await (supabaseAdmin as any)
    .from("properties")
    .select("id")
    .eq("id", booking.property_id)
    .maybeSingle();
  if (!property) throw new Error("Booking property does not exist");

  const context = await resolveBookingPaymentContext(supabaseAdmin, {
    propertyId: booking.property_id,
    integrationId,
    currency: String(booking.currency).toUpperCase(),
    callbackBaseUrl: "",
  });
  const adapter = getPaymentProvider(context.provider);
  const status = await adapter.getStatus(context, opts.orderTrackingId);
  const merchantMatches = Boolean(expectedMerchantReference) &&
    Boolean(status.merchantReference) && status.merchantReference === expectedMerchantReference;

  if (!merchantMatches) {
    await (supabaseAdmin as any).from("payment_events").insert({
      booking_id: booking.id,
      property_id: booking.property_id,
      integration_id: integrationId,
      provider,
      event_type: "security:merchant_reference_mismatch",
      order_tracking_id: opts.orderTrackingId,
      provider_transaction_id: opts.orderTrackingId,
      merchant_reference: status.merchantReference,
      amount: status.amount,
      currency: status.currency,
      raw: { expectedMerchantReference, receivedMerchantReference: status.merchantReference },
    });
    return { outcome: "mismatch", paymentMethod: null };
  }

  const paymentMethod = status.paymentMethod;
  const outcome = status.status === "completed" ? "completed" :
    status.status === "failed" ? "failed" :
    status.status === "reversed" ? "reversed" : "pending";

  await (supabaseAdmin as any).from("payment_events").insert({
    booking_id: booking.id,
    property_id: booking.property_id,
    integration_id: integrationId,
    provider,
    event_type: `${opts.source}:${outcome}`,
    order_tracking_id: opts.orderTrackingId,
    provider_transaction_id: opts.orderTrackingId,
    merchant_reference: status.merchantReference,
    payment_method: paymentMethod,
    amount: status.amount,
    currency: status.currency,
    raw: JSON.parse(JSON.stringify(status.raw ?? status)),
  });

  if (outcome === "failed" || outcome === "reversed") {
    await (supabaseAdmin as any).from("bookings")
      .update({ payment_failed_at: new Date().toISOString() })
      .eq("id", booking.id).eq("property_id", booking.property_id);
    return { outcome, paymentMethod };
  }
  if (outcome !== "completed") return { outcome, paymentMethod };

  const expectedAmount = Number(booking.deposit_amount);
  const paidAmount = status.amount == null ? Number.NaN : Number(status.amount);
  const amountsMatch = Number.isFinite(paidAmount) &&
    Math.round(expectedAmount * 100) === Math.round(paidAmount * 100);
  const expectedCurrency = String(booking.currency).toUpperCase();
  const currencyMatches = Boolean(status.currency) &&
    status.currency.toUpperCase() === expectedCurrency;

  if (!amountsMatch || !currencyMatches) {
    const now = new Date().toISOString();
    await (supabaseAdmin as any).from("bookings").update({
      payment_status: "payment_mismatch",
      payment_mismatch_at: now,
      paid_amount: Number.isFinite(paidAmount) ? paidAmount : null,
      payment_method: paymentMethod,
    }).eq("id", booking.id).eq("property_id", booking.property_id);
    await (supabaseAdmin as any).from("payment_events").insert({
      booking_id: booking.id,
      property_id: booking.property_id,
      integration_id: integrationId,
      provider,
      event_type: "security:payment_mismatch",
      order_tracking_id: opts.orderTrackingId,
      provider_transaction_id: opts.orderTrackingId,
      amount: Number.isFinite(paidAmount) ? paidAmount : null,
      currency: status.currency,
      raw: { expectedAmount, paidAmount: status.amount, expectedCurrency, paidCurrency: status.currency },
    });
    return { outcome: "mismatch", paymentMethod };
  }

  const now = new Date().toISOString();
  const invoiceNumber = booking.invoice_number ?? makeInvoiceNumber(booking.reference);
  const { error: finalizeError } = await (supabaseAdmin as any).from("bookings").update({
    payment_status: "deposit_paid",
    status: "confirmed",
    payment_method: paymentMethod,
    payment_completed_at: now,
    confirmed_at: now,
    paid_amount: paidAmount,
    invoice_number: invoiceNumber,
  }).eq("id", booking.id).eq("property_id", booking.property_id)
    .not("payment_status", "in", '("deposit_paid","paid")');
  if (finalizeError) throw new Error(`Could not finalize verified payment: ${finalizeError.message}`);

  try {
    const { sendBookingConfirmedEmail } = await import("./booking-confirmation-email.server");
    const result = await sendBookingConfirmedEmail(booking.id);
    if (!result.ok) console.error("confirmation email failed");
  } catch (e) {
    console.error("confirmation email error", e);
  }
  return { outcome: "completed", paymentMethod };
}
