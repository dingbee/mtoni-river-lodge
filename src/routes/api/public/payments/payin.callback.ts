import { createFileRoute } from "@tanstack/react-router";
import { validatePaymentCallbackIdentity } from "@/lib/payment-integrity";

export const Route = createFileRoute("/api/public/payments/payin/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const fail = (status: number, message: string) => Response.json({ ok: false, error: message }, { status });
        try {
          const rawRequest = request.clone();
          const rawBody = await rawRequest.text();
          if (!rawBody || rawBody.length > 64_000) return fail(400, "Invalid callback payload");

          let payload: Record<string, unknown>;
          try {
            const parsed: unknown = JSON.parse(rawBody);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail(400, "Invalid callback payload");
            payload = parsed as Record<string, unknown>;
          } catch {
            return fail(400, "Invalid callback payload");
          }

          const transactionId = typeof payload.request_ref === "string" ? payload.request_ref : "";
          if (!transactionId || !/^[A-Za-z0-9_-]{1,120}$/.test(transactionId)) return fail(400, "Missing transaction reference");

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: booking, error } = await (supabaseAdmin as any)
            .from("bookings")
            .select("id, property_id, payment_provider, payment_integration_id, provider_transaction_id, provider_merchant_reference")
            .eq("provider_transaction_id", transactionId)
            .eq("payment_provider", "payin")
            .maybeSingle();
          if (error) throw new Error("Could not resolve PayIn payment attempt");
          if (!booking || !booking.property_id || !booking.payment_integration_id) {
            // Fail closed; do not disclose whether a transaction or tenant exists.
            return fail(404, "Payment attempt not found");
          }

          const { resolveBookingPaymentContext } = await import("@/lib/payment-context.server");
          const context = await resolveBookingPaymentContext(supabaseAdmin, {
            propertyId: booking.property_id,
            integrationId: booking.payment_integration_id,
            currency: "TZS",
            callbackBaseUrl: "",
          });
          if (context.provider !== "payin" || context.propertyId !== booking.property_id ||
              context.integrationId !== booking.payment_integration_id || context.environment !== "sandbox") {
            return fail(403, "Callback integration is not eligible for sandbox processing");
          }

          const { payinAdapter } = await import("@/lib/payment-providers/payin.adapter.server");
          const verified = await payinAdapter.verifyWebhook?.(context, request);
          if (!verified) return fail(400, "Webhook verification is unavailable");
          const identity = validatePaymentCallbackIdentity({
            bookingPropertyId: booking.property_id,
            callbackPropertyId: context.propertyId,
            bookingIntegrationId: booking.payment_integration_id,
            callbackIntegrationId: context.integrationId,
            bookingProvider: booking.payment_provider,
            callbackProvider: verified.provider,
            storedTransactionId: booking.provider_transaction_id,
            receivedTransactionId: verified.providerTransactionId,
            storedMerchantReference: booking.provider_merchant_reference,
            receivedMerchantReference: verified.merchantReference,
          });
          if (!identity.ok) {
            await (supabaseAdmin as any).from("payment_events").insert({
              booking_id: booking.id, property_id: booking.property_id,
              integration_id: booking.payment_integration_id, provider: "payin",
              event_type: "security:webhook_identity_mismatch",
              provider_transaction_id: transactionId,
              merchant_reference: verified.merchantReference,
              raw: { reason: identity.reason, event: payload.event },
            });
            return fail(409, "Payment callback identity mismatch");
          }

          // Never trust a webhook status alone to confirm payment. The finalizer
          // independently queries PayIn and checks merchant reference, amount and currency.
          const { verifyAndFinalizePayment } = await import("@/lib/payment-finalize.server");
          const result = await verifyAndFinalizePayment({
            bookingId: booking.id,
            orderTrackingId: transactionId,
            source: "ipn",
            expectedPropertyId: booking.property_id,
          });
          return Response.json({ ok: true, outcome: result.outcome }, { status: 200 });
        } catch (error) {
          console.error("[payin] callback processing failed", error instanceof Error ? error.message : "unknown error");
          return Response.json({ ok: false, error: "Callback processing failed" }, { status: 500 });
        }
      },
    },
  },
});
