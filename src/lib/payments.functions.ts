import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";
import { assertSameProperty } from "@/lib/booking-property";


export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      reference: z.string().min(4).max(40),
      email: z.string().trim().email().max(255),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const {
      ensurePesapalPropertyAccountIpn,
      submitPesapalPropertyAccountOrder,
    } = await import("./pesapal.server");
    const {
      getActivePropertyPesapalAccount,
      readPropertyPesapalCredentials,
    } = await import("./property-pesapal-account.server");

    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const propertyId = channel.propertyId;
    const { data: booking, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select("id, reference, guest_name, guest_email, guest_phone, country, deposit_amount, total, currency, payment_status, pesapal_order_tracking_id, property_id, sales_channel_id")
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
    // Never initiate payment for a booking outside the configured property.
    assertSameProperty(booking.property_id, propertyId, "Booking");
    if (booking.sales_channel_id !== channel.channelId) throw new Error("Booking does not belong to this direct-booking channel");
    if (booking.currency !== channel.currency) throw new Error("Booking currency does not match the published direct-booking channel");
    if (booking.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Email does not match booking");
    }
    if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") {
      throw new Error("Booking is already paid");
    }

    const account = await getActivePropertyPesapalAccount(supabaseAdmin, channel.organisationId, propertyId, booking.currency);
    const credentials = await readPropertyPesapalCredentials(supabaseAdmin, account.credential_secret_ref);
    const baseUrl = `https://${channel.hostname}`;
    console.info("[pesapal] initiatePayment", {
      reference: data.reference,
      baseUrl,
    });
    const storedIpnId = typeof account.public_configuration?.ipn_id === "string"
      ? account.public_configuration.ipn_id
      : null;
    const ipn = await ensurePesapalPropertyAccountIpn(baseUrl, credentials, account.environment, storedIpnId);
    if (account.public_configuration?.ipn_id !== ipn.ipnId || account.public_configuration?.ipn_url !== ipn.ipnUrl) {
      const { error: ipnConfigError } = await supabaseAdmin
        .from("staynas_guest_payment_provider_accounts")
        .update({ public_configuration: { ...account.public_configuration, ipn_id: ipn.ipnId, ipn_url: ipn.ipnUrl } })
        .eq("id", account.id).eq("property_id", propertyId).eq("organisation_id", channel.organisationId);
      if (ipnConfigError) throw new Error("Property Pesapal IPN registration could not be persisted.");
    }
    const { error: accountBindingError } = await supabaseAdmin.from("bookings")
      .update({ payment_provider: "pesapal", payment_provider_account_id: account.id })
      .eq("id", booking.id).eq("property_id", propertyId).eq("sales_channel_id", channel.channelId);
    if (accountBindingError) throw new Error("Booking could not be bound to its property Pesapal account.");

    if (booking.currency !== "TZS" && booking.currency !== "USD") {
      throw new Error("Booking currency is missing or unsupported. Payment cannot be initiated.");
    }

    const deposit = Number(booking.deposit_amount);
    if (!deposit || deposit <= 0) throw new Error("Invalid deposit amount");

    const merchantRef = `${booking.reference}-D${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const callbackUrl = `${baseUrl}/booking/return?ref=${encodeURIComponent(booking.reference)}`;

    const [firstName, ...rest] = (booking.guest_name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName || "Guest";

    const order = await submitPesapalPropertyAccountOrder({
      merchantReference: merchantRef,
      amount: deposit,
      currency: booking.currency,
      description: `Mtoni River Lodge deposit – ${booking.reference}`,
      callbackUrl,
      notificationId: ipn.ipnId,
      email: booking.guest_email,
      phone: booking.guest_phone,
      firstName: firstName || "Guest",
      lastName,
    });

    await supabaseAdmin
      .from("bookings")
      .update({
        payment_provider: "pesapal",
        payment_provider_account_id: account.id,
        pesapal_order_tracking_id: order.order_tracking_id,
        pesapal_merchant_reference: order.merchant_reference,
        payment_initiated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    await supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
      provider_account_id: account.id,
      provider: "pesapal",
      event_type: "order_submitted",
      order_tracking_id: order.order_tracking_id,
      merchant_reference: order.merchant_reference,
      amount: deposit,
      currency: booking.currency,
      raw: JSON.parse(JSON.stringify(order)),
    });

    return {
      redirectUrl: order.redirect_url,
      orderTrackingId: order.order_tracking_id,
      amount: deposit,
      currency: booking.currency,
    };
  });

export const getPaymentStatusByReference = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ reference: z.string().min(4).max(40), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const channel = await resolvePublicDirectBookingChannel(supabaseAdmin);
    const propertyId = channel.propertyId;
    const { data: booking, error } = await (supabaseAdmin as any)
      .from("bookings")
      .select("id, reference, guest_email, payment_status, status, deposit_amount, balance_amount, total, currency, pesapal_order_tracking_id, payment_method, property_id, sales_channel_id")
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
    // Never report payment state for a booking outside the configured property.
    assertSameProperty(booking.property_id, propertyId, "Booking");
    if (booking.sales_channel_id !== channel.channelId) throw new Error("Booking does not belong to this direct-booking channel");
    if (booking.currency !== channel.currency) throw new Error("Booking currency does not match the published direct-booking channel");
    if (booking.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Email does not match booking");
    }

    // If already finalised, return cached.
    if (
      booking.payment_status === "paid" ||
      booking.payment_status === "deposit_paid"
    ) {
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

    let outcome: "pending" | "completed" | "failed" | "reversed" | "mismatch" | "already_finalized" = "pending";
    let paymentMethod: string | null = booking.payment_method ?? null;

    if (booking.pesapal_order_tracking_id) {
      const { verifyAndFinalizePayment } = await import("./payment-finalize.server");
      const result = await verifyAndFinalizePayment({
        bookingId: booking.id,
        orderTrackingId: booking.pesapal_order_tracking_id,
        source: "status_check",
      });
      outcome = result.outcome;
      paymentMethod = result.paymentMethod ?? paymentMethod;
    }

    const { data: refreshed } = await supabaseAdmin
      .from("bookings")
      .select("status, payment_status, payment_method, deposit_amount, balance_amount, total, currency, invoice_number")
      .eq("id", booking.id)
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