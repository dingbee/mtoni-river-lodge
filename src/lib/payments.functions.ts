import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";

function deriveBaseUrl(): string {
  const envUrl = process.env.PUBLIC_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = getRequestHeader("x-forwarded-proto") ?? "https";
  const host = getRequestHeader("host") ?? "";
  return `${proto}://${host}`;
}

export const initiatePayment = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      reference: z.string().min(4).max(40),
      email: z.string().trim().email().max(255),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { ensureIpn, submitPesapalOrder } = await import("./pesapal.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, reference, guest_name, guest_email, guest_phone, country, deposit_amount, total, currency, payment_status, pesapal_order_tracking_id")
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
    if (booking.guest_email.toLowerCase() !== data.email.toLowerCase()) {
      throw new Error("Email does not match booking");
    }
    if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") {
      throw new Error("Booking is already paid");
    }

    const baseUrl = deriveBaseUrl();
    const notificationId = await ensureIpn(baseUrl);

    const deposit = Number(booking.deposit_amount);
    if (!deposit || deposit <= 0) throw new Error("Invalid deposit amount");

    const merchantRef = `${booking.reference}-D${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const callbackUrl = `${baseUrl}/booking/return?ref=${encodeURIComponent(booking.reference)}`;

    const [firstName, ...rest] = (booking.guest_name ?? "").trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName || "Guest";

    const order = await submitPesapalOrder({
      merchantReference: merchantRef,
      amount: deposit,
      currency: booking.currency || "USD",
      description: `Mtoni River Lodge deposit – ${booking.reference}`,
      callbackUrl,
      notificationId,
      email: booking.guest_email,
      phone: booking.guest_phone,
      firstName: firstName || "Guest",
      lastName,
    });

    await supabaseAdmin
      .from("bookings")
      .update({
        pesapal_order_tracking_id: order.order_tracking_id,
        pesapal_merchant_reference: order.merchant_reference,
        payment_initiated_at: new Date().toISOString(),
      })
      .eq("id", booking.id);

    await supabaseAdmin.from("payment_events").insert({
      booking_id: booking.id,
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
    const { getPesapalTransactionStatus, classifyStatus } = await import("./pesapal.server");

    const { data: booking, error } = await supabaseAdmin
      .from("bookings")
      .select("id, reference, guest_email, payment_status, status, deposit_amount, balance_amount, total, currency, pesapal_order_tracking_id, payment_method")
      .eq("reference", data.reference)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!booking) throw new Error("Booking not found");
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

    let outcome: "pending" | "completed" | "failed" | "reversed" = "pending";
    let paymentMethod: string | null = booking.payment_method ?? null;

    if (booking.pesapal_order_tracking_id) {
      const status = await getPesapalTransactionStatus(booking.pesapal_order_tracking_id);
      outcome = classifyStatus(status.status_code);
      paymentMethod = status.payment_method ?? paymentMethod;

      await supabaseAdmin.from("payment_events").insert({
        booking_id: booking.id,
        provider: "pesapal",
        event_type: "status_check",
        order_tracking_id: booking.pesapal_order_tracking_id,
        status_code: status.status_code ?? null,
        payment_method: paymentMethod,
        amount: status.amount,
        currency: status.currency,
        raw: JSON.parse(JSON.stringify(status)),
      });

      if (outcome === "completed") {
        const nowIso = new Date().toISOString();
        await supabaseAdmin
          .from("bookings")
          .update({
            payment_status: "deposit_paid",
            status: "confirmed",
            payment_method: paymentMethod,
            payment_completed_at: nowIso,
            confirmed_at: nowIso,
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
      } else if (outcome === "failed" || outcome === "reversed") {
        await supabaseAdmin
          .from("bookings")
          .update({ payment_failed_at: new Date().toISOString() })
          .eq("id", booking.id);
      }
    }

    const { data: refreshed } = await supabaseAdmin
      .from("bookings")
      .select("status, payment_status, payment_method, deposit_amount, balance_amount, total, currency")
      .eq("id", booking.id)
      .maybeSingle();

    return {
      reference: booking.reference,
      bookingStatus: refreshed?.status ?? booking.status,
      paymentStatus: refreshed?.payment_status ?? booking.payment_status,
      paymentMethod: refreshed?.payment_method ?? paymentMethod,
      outcome,
      deposit: Number(refreshed?.deposit_amount ?? booking.deposit_amount),
      balance: Number(refreshed?.balance_amount ?? booking.balance_amount),
      total: Number(refreshed?.total ?? booking.total),
      currency: refreshed?.currency ?? booking.currency,
    };
  });