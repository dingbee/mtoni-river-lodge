import { createFileRoute } from "@tanstack/react-router";
import { queryTenantPesapalStatus } from "@/domains/commercial/commercial-pesapal.server";

async function handleCommercialPesapalNotification(orderTrackingId: string, merchantReference: string, notificationType: string) {
  if (!orderTrackingId || !merchantReference.startsWith("SN-COM-")) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;
  const paymentId = merchantReference.slice("SN-COM-".length);
  const { data: payment, error } = await admin.from("commercial_payment_transactions")
    .select("id,organisation_id,provider_account_id,provider,provider_order_ref,amount_minor,currency,status")
    .eq("id", paymentId).eq("provider", "pesapal").maybeSingle();
  if (error || !payment || payment.provider_order_ref !== orderTrackingId) return false;
  const { data: account, error: accountError } = await admin.from("commercial_provider_accounts")
    .select("id,credential_secret_ref").eq("id", payment.provider_account_id)
    .eq("organisation_id", payment.organisation_id).eq("provider", "pesapal").maybeSingle();
  if (accountError || !account) return false;
  await admin.from("commercial_provider_notifications").upsert({
    organisation_id: payment.organisation_id, provider_account_id: account.id,
    provider: "pesapal", provider_event_ref: `${orderTrackingId}:${notificationType || "unknown"}`,
    provider_order_ref: orderTrackingId, raw_payload: { orderTrackingId, merchantReference, notificationType },
  }, { onConflict: "provider,provider_event_ref", ignoreDuplicates: true });
  const { data: result, error: queryError } = await queryTenantPesapalStatus({
    providerAccountId: account.id, secretRef: account.credential_secret_ref, orderTrackingId,
  }).then(data => ({ data, error: null })).catch(error => ({ data: null, error }));
  if (queryError || !result || result.merchantReference !== merchantReference) return false;
  if (result.statusCode === 1) {
    const amountMinor = Math.round(result.amount * 100);
    if (!Number.isSafeInteger(amountMinor) || amountMinor !== Number(payment.amount_minor) || result.currency !== payment.currency || !result.confirmationCode) return false;
    const { error: allocationError } = await admin.rpc("commercial_confirm_and_allocate_payment", {
      _payment_id: payment.id, _provider_transaction_ref: result.confirmationCode,
      _verified_amount_minor: amountMinor, _currency: result.currency,
      _verification_source: "server_provider_query", _settlement_ref: result.confirmationCode,
      _idempotency_key: `pesapal-settlement-${result.confirmationCode}`, _verified_at: new Date().toISOString(),
    });
    if (allocationError) return false;
    try {
      const { sendCommercialPaymentConfirmationEmail } = await import("@/domains/commercial/commercial-financial-notifications.server");
      await sendCommercialPaymentConfirmationEmail({ admin, paymentId: payment.id });
    } catch (notificationError) {
      console.error("[staynas-commercial-pesapal] receipt notification failed", notificationError);
    }
  } else if (result.statusCode === 2) {
    const { error: failureError } = await admin.rpc("commercial_record_payment_failure", {
      _payment_id: payment.id, _provider_event_ref: `pesapal-failed-${orderTrackingId}`,
      _final_status: "failed", _reason_code: "provider_status_failed",
      _idempotency_key: `pesapal-failure-${orderTrackingId}`,
    });
    if (failureError) return false;
    try {
      const { sendCommercialPaymentFailureEmail } = await import("@/domains/commercial/commercial-financial-notifications.server");
      await sendCommercialPaymentFailureEmail({ admin, paymentId: payment.id });
    } catch (notificationError) {
      console.error("[staynas-commercial-pesapal] failure notification failed", notificationError);
    }
  } else if (result.statusCode === 3) {
    if (!result.confirmationCode) return false;
    const { error: reversalError } = await admin.rpc("commercial_record_payment_reversal", {
      _payment_id: payment.id, _provider_reversal_ref: result.confirmationCode,
      _amount_minor: payment.amount_minor, _currency: payment.currency,
      _reason_code: "provider_reversal_verified", _idempotency_key: `pesapal-reversal-${result.confirmationCode}`,
      _verified_at: new Date().toISOString(), _actor_user_id: null,
    });
    if (reversalError) return false;
  }
  return true;
}

function ack(url: URL, ok: boolean) {
  return Response.json({
    orderNotificationType: url.searchParams.get("OrderNotificationType") ?? "",
    orderTrackingId: url.searchParams.get("OrderTrackingId") ?? "",
    orderMerchantReference: url.searchParams.get("OrderMerchantReference") ?? "",
    status: ok ? 200 : 500,
  });
}

export const Route = createFileRoute("/api/public/commercial-pesapal/ipn")({
  server: { handlers: {
    GET: async ({ request }) => {
      const url = new URL(request.url);
      try {
        const ok = await handleCommercialPesapalNotification(
          url.searchParams.get("OrderTrackingId") ?? "",
          url.searchParams.get("OrderMerchantReference") ?? "",
          url.searchParams.get("OrderNotificationType") ?? "",
        );
        return ack(url, ok);
      } catch (error) {
        console.error("[staynas-commercial-pesapal] notification processing failed", error);
        return ack(url, false);
      }
    },
    POST: async ({ request }) => {
      const body = await request.json().catch(() => ({})) as Record<string,string>;
      const url = new URL(request.url);
      url.searchParams.set("OrderTrackingId", body.OrderTrackingId ?? "");
      url.searchParams.set("OrderMerchantReference", body.OrderMerchantReference ?? "");
      url.searchParams.set("OrderNotificationType", body.OrderNotificationType ?? "");
      try {
        const ok = await handleCommercialPesapalNotification(
          body.OrderTrackingId ?? "", body.OrderMerchantReference ?? "", body.OrderNotificationType ?? "",
        );
        return ack(url, ok);
      } catch (error) {
        console.error("[staynas-commercial-pesapal] notification processing failed", error);
        return ack(url, false);
      }
    },
  } },
});
