import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";
import { assertSameProperty } from "@/lib/booking-property";

function deriveBaseUrl(): string {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHeader("x-forwarded-host") ?? getRequestHeader("host") ?? "";
  if (!host) throw new Error("Cannot determine tenant callback URL");
  return `${proto}://${host.split(",")[0].trim()}`;
}

function makeMerchantReference(reference: string): string {
  return `${reference}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`.slice(0, 40);
}

export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      reference: z.string().min(4).max(40),
      email: z.string().trim().email().max(255),
      provider: z.string().trim().min(2).max(60).optional(),
      integrationId: z.string().uuid().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveBookingPaymentContext } = await import("./payment-context.server");
    const { getPaymentProvider } = await import("./payment-providers.server");

    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const { data: booking, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select("id, reference, guest_name, guest_email, guest_phone, country, deposit_amount, total, currency, payment_status, payment_provider, payment_integration_id, provider_transaction_id, provider_merchant_reference, pesapal_order_tracking_id, property_id")
      .eq("reference", data.reference)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found for this property");
    assertSameProperty(booking.property_id, propertyId, "Booking");
    if (booking.guest_email.toLowerCase() !== data.email.toLowerCase()) throw new Error("Email does not match booking");
    if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") throw new Error("Booking is already paid");
    if (booking.provider_transaction_id || booking.pesapal_order_tracking_id) {
      throw new Error("A payment attempt already exists for this booking; check its status before creating another");
    }

    const providerName = (data.provider ?? booking.payment_provider ?? "").toLowerCase();
    if (!providerName) throw new Error("No payment provider is selected for this booking");
    const baseUrl = deriveBaseUrl();
    const context = await resolveBookingPaymentContext(supabaseAdmin, {
      propertyId,
      integrationId: data.integrationId ?? booking.payment_integration_id ?? undefined,
      provider: data.integrationId || booking.payment_integration_id ? undefined : providerName,
      currency: String(booking.currency).toUpperCase(),
      callbackBaseUrl: baseUrl,
    });
    if (context.provider !== providerName) throw new Error("Selected provider does not match the booking's configured provider");
    const adapter = getPaymentProvider(context.provider);
    const deposit = Number(booking.deposit_amount);
    if (!Number.isFinite(deposit) || deposit <= 0) throw new Error("Invalid deposit amount");
    const merchantReference = makeMerchantReference(booking.reference);
    const [firstName, ...rest] = String(booking.guest_name ?? "").trim().split(/\s+/);
    const returnUrl = `${baseUrl}/booking/return?ref=${encodeURIComponent(booking.reference)}`;
    const result = await adapter.createIntent(context, {
      bookingId: booking.id,
      bookingReference: booking.reference,
      merchantReference,
      amount: deposit,
      currency: String(booking.currency).toUpperCase(),
      description: `Accommodation deposit - ${booking.reference}`,
      guest: {
        email: booking.guest_email,
        phone: booking.guest_phone,
        firstName: firstName || "Guest",
        lastName: rest.join(" ") || firstName || "Guest",
        countryCode: String(booking.country ?? "").toUpperCase().slice(0, 2) || undefined,
      },
      returnUrl,
      callbackUrl: `${baseUrl}/api/public/payments/${encodeURIComponent(context.provider)}/callback`,
    });

    if (result.merchantReference !== merchantReference) throw new Error("Provider response merchant reference mismatch");
    const { error: updateError } = await (supabaseAdmin as any)
      .from("bookings")
      .update({
        payment_provider: context.provider,
        payment_integration_id: context.integrationId,
        provider_transaction_id: result.providerTransactionId,
        provider_merchant_reference: result.merchantReference,
        ...(context.provider === "pesapal" ? {
          pesapal_order_tracking_id: result.providerTransactionId,
          pesapal_merchant_reference: result.merchantReference,
        } : {}),
        payment_initiated_at: new Date().toISOString(),
      })
      .eq("id", booking.id)
      .eq("property_id", propertyId);
    if (updateError) throw new Error(`Payment intent created but booking record update failed: ${updateError.message}`);

    await (supabaseAdmin as any).from("payment_events").insert({
      booking_id: booking.id,
      property_id: propertyId,
      integration_id: context.integrationId,
      provider: context.provider,
      event_type: "order_submitted",
      order_tracking_id: result.providerTransactionId,
      provider_transaction_id: result.providerTransactionId,
      merchant_reference: result.merchantReference,
      amount: deposit,
      currency: booking.currency,
      raw: JSON.parse(JSON.stringify(result.raw ?? { status: result.status })),
    });

    return {
      provider: context.provider,
      redirectUrl: result.checkoutUrl ?? null,
      instructions: result.instructions ?? null,
      orderTrackingId: result.providerTransactionId,
      amount: deposit,
      currency: booking.currency,
      status: result.status,
    };
  });

export const getPaymentStatusByReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ reference: z.string().min(4).max(40), email: z.string().trim().email().max(255) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
    const { data: booking, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select("id, reference, guest_email, payment_status, status, deposit_amount, balance_amount, total, currency, payment_provider, payment_method, payment_integration_id, provider_transaction_id, provider_merchant_reference, pesapal_order_tracking_id, property_id")
      .eq("reference", data.reference)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found for this property");
    assertSameProperty(booking.property_id, propertyId, "Booking");
    if (booking.guest_email.toLowerCase() !== data.email.toLowerCase()) throw new Error("Email does not match booking");

    if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") {
      return {
        reference: booking.reference,
        bookingStatus: booking.status,
        paymentStatus: booking.payment_status,
        paymentMethod: booking.payment_method,
        deposit: Number(booking.deposit_amount),
        balance: Number(booking.balance_amount),
        total: Number(booking.total),
        currency: booking.currency,
      };
    }

    const transactionId = booking.provider_transaction_id ?? booking.pesapal_order_tracking_id;
    let outcome: string = "pending";
    let paymentMethod: string | null = booking.payment_method ?? null;
    if (transactionId) {
      const { verifyAndFinalizePayment } = await import("./payment-finalize.server");
      const result = await verifyAndFinalizePayment({
        bookingId: booking.id,
        orderTrackingId: transactionId,
        source: "status_check",
      });
      outcome = result.outcome;
      paymentMethod = result.paymentMethod ?? paymentMethod;
    }

    const { data: refreshed } = await (supabaseAdmin as any)
      .from("bookings")
      .select("status, payment_status, payment_method, deposit_amount, balance_amount, total, currency, invoice_number")
      .eq("id", booking.id)
      .eq("property_id", propertyId)
      .maybeSingle();
    return {
      reference: booking.reference,
      bookingStatus: refreshed?.status ?? booking.status,
      paymentStatus: refreshed?.payment_status ?? booking.payment_status,
      paymentMethod: refreshed?.payment_method ?? paymentMethod,
      outcome,
      invoiceNumber: refreshed?.invoice_number ?? null,
      deposit: Number(refreshed?.deposit_amount ?? booking.deposit_amount),
      balance: Number(refreshed?.balance_amount ?? booking.balance_amount),
      total: Number(refreshed?.total ?? booking.total),
      currency: refreshed?.currency ?? booking.currency,
    };
  });
