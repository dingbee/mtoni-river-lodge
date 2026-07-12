import { createFileRoute } from "@tanstack/react-router";

// Pesapal IPN: called as GET with query params OrderTrackingId, OrderMerchantReference, OrderNotificationType
// We respond with the same fields + status=200 per Pesapal v3 contract.

async function handleNotification(orderTrackingId: string, merchantReference: string, notificationType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  console.info("[pesapal] IPN received", { orderTrackingId, merchantReference, notificationType });

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

  if (!booking) {
    console.warn("[pesapal] IPN: no booking matches orderTrackingId", { orderTrackingId });
    return;
  }

  const { verifyAndFinalizePayment } = await import("@/lib/payment-finalize.server");
  const result = await verifyAndFinalizePayment({
    bookingId: booking.id,
    orderTrackingId,
    source: "ipn",
  });
  console.info("[pesapal] IPN finalize outcome", {
    bookingId: booking.id,
    outcome: result.outcome,
    paymentMethod: result.paymentMethod,
  });
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