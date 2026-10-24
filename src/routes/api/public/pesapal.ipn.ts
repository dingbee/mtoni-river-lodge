import { createFileRoute } from "@tanstack/react-router";

async function handleNotification(orderTrackingId: string, merchantReference: string, notificationType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!orderTrackingId || !merchantReference) throw new Error("Missing provider transaction identifiers");

  const { data: booking, error } = await (supabaseAdmin as any)
    .from("bookings")
    .select("id, reference, property_id, payment_status, payment_provider, payment_integration_id, provider_transaction_id, provider_merchant_reference, pesapal_order_tracking_id, pesapal_merchant_reference")
    .or(`provider_transaction_id.eq.${orderTrackingId},pesapal_order_tracking_id.eq.${orderTrackingId}`)
    .maybeSingle();
  if (error) throw new Error(`Could not resolve payment notification: ${error.message}`);

  const expectedTransaction = booking?.provider_transaction_id ?? booking?.pesapal_order_tracking_id;
  const expectedMerchant = booking?.provider_merchant_reference ?? booking?.pesapal_merchant_reference;
  const matches = Boolean(booking) &&
    expectedTransaction === orderTrackingId &&
    Boolean(expectedMerchant) &&
    expectedMerchant === merchantReference &&
    String(booking.payment_provider ?? "pesapal").toLowerCase() === "pesapal" &&
    Boolean(booking.payment_integration_id);

  await (supabaseAdmin as any).from("payment_events").insert({
    booking_id: booking?.id ?? null,
    property_id: booking?.property_id ?? null,
    integration_id: booking?.payment_integration_id ?? null,
    provider: "pesapal",
    event_type: `ipn:${notificationType || "unknown"}${booking && !matches ? ":security_identifier_mismatch" : ""}`,
    order_tracking_id: orderTrackingId,
    provider_transaction_id: orderTrackingId,
    merchant_reference: merchantReference,
    raw: { orderTrackingId, merchantReference, notificationType },
  });

  if (!booking) {
    console.warn("[pesapal] IPN ignored: no matching booking", { orderTrackingId });
    return;
  }
  if (!matches) {
    console.error("[pesapal] IPN rejected: transaction, merchant reference, provider or integration mismatch", {
      bookingId: booking.id,
      propertyId: booking.property_id,
      integrationId: booking.payment_integration_id,
    });
    return;
  }

  const { verifyAndFinalizePayment } = await import("@/lib/payment-finalize.server");
  const result = await verifyAndFinalizePayment({
    bookingId: booking.id,
    orderTrackingId,
    source: "ipn",
    expectedPropertyId: booking.property_id,
  });
  console.info("[pesapal] IPN finalize outcome", {
    bookingId: booking.id,
    propertyId: booking.property_id,
    outcome: result.outcome,
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
