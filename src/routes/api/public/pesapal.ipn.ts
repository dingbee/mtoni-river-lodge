import { createFileRoute } from "@tanstack/react-router";

// Pesapal IPN: called as GET with query params OrderTrackingId, OrderMerchantReference, OrderNotificationType
// We respond with the same fields + status=200 per Pesapal v3 contract.

async function handleNotification(orderTrackingId: string, merchantReference: string, notificationType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getPesapalTransactionStatus, classifyStatus } = await import("@/lib/pesapal.server");

  const { data: booking } = await supabaseAdmin
    .from("bookings")
    .select("id, payment_status")
    .eq("pesapal_order_tracking_id", orderTrackingId)
    .maybeSingle();

  // Always log the raw notification, even if booking missing.
  await supabaseAdmin.from("payment_events").insert({
    booking_id: booking?.id ?? null,
    provider: "pesapal",
    event_type: `ipn:${notificationType || "unknown"}`,
    order_tracking_id: orderTrackingId,
    merchant_reference: merchantReference,
    raw: { orderTrackingId, merchantReference, notificationType },
  });

  if (!booking) return;

  // Dedupe: if already finalised, skip the status fetch & update.
  if (booking.payment_status === "paid" || booking.payment_status === "deposit_paid") return;

  const status = await getPesapalTransactionStatus(orderTrackingId);
  const outcome = classifyStatus(status.status_code);

  await supabaseAdmin.from("payment_events").insert({
    booking_id: booking.id,
    provider: "pesapal",
    event_type: `ipn_status:${outcome}`,
    order_tracking_id: orderTrackingId,
    merchant_reference: merchantReference,
    status_code: status.status_code ?? null,
    payment_method: status.payment_method ?? null,
    amount: status.amount ?? null,
    currency: status.currency ?? null,
    raw: JSON.parse(JSON.stringify(status)),
  });

  if (outcome === "completed") {
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("bookings")
      .update({
        payment_status: "deposit_paid",
        status: "confirmed",
        payment_method: status.payment_method ?? null,
        payment_completed_at: nowIso,
        confirmed_at: nowIso,
      })
      .eq("id", booking.id)
      .neq("payment_status", "deposit_paid")
      .neq("payment_status", "paid");
    try {
      const { sendBookingConfirmedEmail } = await import("@/lib/booking-confirmation-email.server");
      await sendBookingConfirmedEmail(booking.id);
    } catch (e) {
      console.error("ipn confirmation email error:", e);
    }
  } else if (outcome === "failed" || outcome === "reversed") {
    await supabaseAdmin
      .from("bookings")
      .update({ payment_failed_at: new Date().toISOString() })
      .eq("id", booking.id);
  }
}

function ack(orderTrackingId: string, merchantReference: string, notificationType: string, ok: boolean) {
  return Response.json({
    orderNotificationType: notificationType,
    orderTrackingId,
    orderMerchantReference: merchantReference,
    status: ok ? 200 : 500,
  });
}

export const Route = createFileRoute("/api/public/pesapal/ipn")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orderTrackingId = url.searchParams.get("OrderTrackingId") ?? "";
        const merchantReference = url.searchParams.get("OrderMerchantReference") ?? "";
        const notificationType = url.searchParams.get("OrderNotificationType") ?? "";
        try {
          if (orderTrackingId) await handleNotification(orderTrackingId, merchantReference, notificationType);
          return ack(orderTrackingId, merchantReference, notificationType, true);
        } catch (e) {
          console.error("Pesapal IPN error", e);
          return ack(orderTrackingId, merchantReference, notificationType, false);
        }
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, string>;
        const orderTrackingId = body.OrderTrackingId ?? "";
        const merchantReference = body.OrderMerchantReference ?? "";
        const notificationType = body.OrderNotificationType ?? "";
        try {
          if (orderTrackingId) await handleNotification(orderTrackingId, merchantReference, notificationType);
          return ack(orderTrackingId, merchantReference, notificationType, true);
        } catch (e) {
          console.error("Pesapal IPN error", e);
          return ack(orderTrackingId, merchantReference, notificationType, false);
        }
      },
    },
  },
});