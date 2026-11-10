import type { SupabaseClient } from "@supabase/supabase-js";
import { createFileRoute } from "@tanstack/react-router";

const EMAIL_BY_EVENT: Record<string, string | null> = {
  booking_created: "booking-received",
  status_confirmed: "booking-confirmed",
  status_cancelled: "booking-cancelled",
  payment_paid: "payment-received",
  payment_partial: "payment-pending",
  payment_unpaid: "payment-pending",
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char]!,
  );
}

function guestRequestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    received: "Received",
    triaged: "Confirmed",
    assigned: "Assigned",
    in_progress: "In progress",
    fulfilled: "Completed",
    cancelled: "Cancelled",
    escalated: "Needs attention",
  };
  return labels[status] ?? "Updated";
}

export const Route = createFileRoute("/api/public/ops/drain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) return new Response("unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { sendTransactionalInternal } = await import("@/lib/email/send-internal.server");
        const { sendStaffWhatsApp } = await import("@/lib/whatsapp/send.server");
        const { sendResendEmail } =
          await import("@/domains/ai/concierge/providers/resend-email.server");
        const wt = await import("@/lib/whatsapp/templates");

        const { data: jobs, error } = await supabaseAdmin
          .from("pending_notifications")
          .select("id, booking_id, event_type, payload, attempts")
          .is("processed_at", null)
          .lt("attempts", 5)
          .order("created_at", { ascending: true })
          .limit(25);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const results: unknown[] = [];
        for (const job of jobs ?? []) {
          try {
            const { data: b } = await supabaseAdmin
              .from("bookings")
              .select(
                "id, property_id, reference, guest_id, guest_name, guest_email, guest_phone, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, currency, status, payment_status, guest_type, room_id",
              )
              .eq("id", job.booking_id)
              .maybeSingle();
            if (!b) {
              await supabaseAdmin
                .from("pending_notifications")
                .update({ processed_at: new Date().toISOString(), last_error: "booking_missing" })
                .eq("id", job.id);
              continue;
            }
            const { data: room } = await supabaseAdmin
              .from("rooms")
              .select("name")
              .eq("id", b.room_id)
              .eq("property_id", b.property_id)
              .maybeSingle();

            if (String(job.event_type).startsWith("guest_request_")) {
              const payload =
                job.payload && typeof job.payload === "object" && !Array.isArray(job.payload)
                  ? (job.payload as Record<string, unknown>)
                  : {};
              const requestId = String(payload.request_id ?? "");
              if (!requestId) throw new Error("Guest request notification is missing request_id.");
              const { data: guestRequest, error: requestError } = await (
                supabaseAdmin as unknown as SupabaseClient
              )
                .from("staynas_guest_requests")
                .select(
                  "id, property_id, booking_id, session_id, guest_id, category, request_text, status, status_note",
                )
                .eq("id", requestId)
                .eq("property_id", b.property_id)
                .eq("booking_id", b.id)
                .maybeSingle();
              if (requestError || !guestRequest)
                throw new Error("Guest request was not found in the booking property.");

              if (!b.guest_email) {
                await supabaseAdmin
                  .from("pending_notifications")
                  .update({
                    processed_at: new Date().toISOString(),
                    last_error: "guest_email_missing",
                  })
                  .eq("id", job.id);
                results.push({ id: job.id, ok: true, skipped: "guest_email_missing" });
                continue;
              }

              const { data: channel } = await supabaseAdmin
                .from("ai_property_channel_settings")
                .select("id, sender_display_name, sender_email, service_consent_required")
                .eq("property_id", b.property_id)
                .eq("channel", "email")
                .eq("enabled", true)
                .eq("outbound_enabled", true)
                .maybeSingle();
              if (!channel?.sender_email)
                throw new Error(
                  "Property email channel is not enabled or has no verified sender identity.",
                );

              const { data: binding } = await supabaseAdmin
                .from("ai_provider_property_bindings")
                .select("id, external_account_id, external_endpoint_id")
                .eq("property_id", b.property_id)
                .eq("channel_id", channel.id)
                .eq("provider", "resend")
                .eq("enabled", true)
                .maybeSingle();
              if (
                !binding ||
                binding.external_endpoint_id.toLowerCase() !== channel.sender_email.toLowerCase()
              ) {
                throw new Error(
                  "No active Resend sender binding exists for this property email channel.",
                );
              }

              if (channel.service_consent_required && b.guest_id) {
                const { data: consent } = await supabaseAdmin
                  .from("ai_guest_channel_preferences")
                  .select("id")
                  .eq("property_id", b.property_id)
                  .eq("guest_id", b.guest_id)
                  .eq("channel", "email")
                  .eq("purpose", "service")
                  .eq("consent_status", "granted")
                  .is("withdrawn_at", null)
                  .maybeSingle();
                if (!consent)
                  throw new Error("Guest service-email consent is not recorded for this property.");
              }

              const { data: suppressed } = await supabaseAdmin
                .from("suppressed_emails")
                .select("id")
                .ilike("email", b.guest_email)
                .limit(1)
                .maybeSingle();
              if (suppressed) {
                await supabaseAdmin.from("email_send_log").insert({
                  template_name: "guest-request-update",
                  recipient_email: b.guest_email,
                  status: "suppressed",
                  metadata: {
                    booking_id: b.id,
                    request_id: guestRequest.id,
                    notification_id: job.id,
                  },
                });
                await supabaseAdmin
                  .from("pending_notifications")
                  .update({
                    processed_at: new Date().toISOString(),
                    last_error: "guest_email_suppressed",
                  })
                  .eq("id", job.id);
                results.push({ id: job.id, ok: true, skipped: "guest_email_suppressed" });
                continue;
              }

              const statusLabel = guestRequestStatusLabel(guestRequest.status);
              const subject =
                job.event_type === "guest_request_received"
                  ? "We received your request"
                  : job.event_type === "guest_request_update"
                    ? "An update on your request"
                    : "Your request status has changed";
              const note = guestRequest.status_note || payload.status_note || "";
              const safeName = escapeHtml(b.guest_name || "Guest");
              const safeReference = escapeHtml(b.reference);
              const safeCategory = escapeHtml(String(guestRequest.category).replaceAll("_", " "));
              const safeStatus = escapeHtml(statusLabel);
              const safeRequest = escapeHtml(guestRequest.request_text);
              const safeNote = escapeHtml(note);
              const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#20242a"><p>Hello ${safeName},</p><h2>${escapeHtml(subject)}</h2><p>Your request for ${safeCategory} at ${escapeHtml(room?.name ?? "your room")} has been updated.</p><p><strong>Booking:</strong> ${safeReference}<br/><strong>Status:</strong> ${safeStatus}</p><p><strong>Your request:</strong><br/>${safeRequest}</p>${safeNote ? `<p><strong>Update from the property team:</strong><br/>${safeNote}</p>` : ""}<p>If you need further assistance, please contact the property reception team.</p><p>Kind regards,<br/>${escapeHtml(channel.sender_display_name || "The property team")}</p></div>`;
              const textBody = [
                `Hello ${b.guest_name || "Guest"},`,
                subject,
                `Booking: ${b.reference}`,
                `Request: ${String(guestRequest.category).replaceAll("_", " ")}`,
                `Status: ${statusLabel}`,
                `Details: ${guestRequest.request_text}`,
                note ? `Update: ${note}` : "",
                "If you need further assistance, please contact the property reception team.",
                `Kind regards, ${channel.sender_display_name || "The property team"}`,
              ]
                .filter(Boolean)
                .join("\n\n");

              const { data: existingMessage } = await supabaseAdmin
                .from("ai_omnichannel_messages")
                .select("id, status, provider_message_id")
                .eq("property_id", b.property_id)
                .eq("channel", "email")
                .contains("metadata", { pending_notification_id: job.id })
                .maybeSingle();

              if (
                existingMessage?.status !== "accepted" &&
                existingMessage?.status !== "delivered"
              ) {
                const sent = await sendResendEmail({
                  from: `${channel.sender_display_name || "The property team"} <${channel.sender_email}>`,
                  to: b.guest_email,
                  subject,
                  html,
                  text: textBody,
                  idempotencyKey: `sn-guest-request-${job.id}`,
                  tags: [
                    { name: "property_id", value: b.property_id },
                    { name: "request_id", value: guestRequest.id },
                  ],
                });
                let messageId = existingMessage?.id;
                if (messageId) {
                  await supabaseAdmin
                    .from("ai_omnichannel_messages")
                    .update({
                      status: "accepted",
                      provider: "resend",
                      provider_message_id: sent.providerMessageId,
                      subject,
                      body: textBody,
                      occurred_at: sent.acceptedAt,
                    })
                    .eq("id", messageId);
                } else if (guestRequest.session_id) {
                  const { data: messageRow, error: messageError } = await supabaseAdmin
                    .from("ai_omnichannel_messages")
                    .insert({
                      property_id: b.property_id,
                      session_id: guestRequest.session_id,
                      guest_id: b.guest_id,
                      channel: "email",
                      direction: "outbound",
                      actor_type: "system",
                      message_type: "event",
                      subject,
                      body: textBody,
                      provider: "resend",
                      provider_message_id: sent.providerMessageId,
                      status: "accepted",
                      metadata: {
                        pending_notification_id: job.id,
                        booking_id: b.id,
                        request_id: guestRequest.id,
                        event_type: job.event_type,
                      },
                      occurred_at: sent.acceptedAt,
                    })
                    .select("id")
                    .single();
                  if (messageError)
                    throw new Error(
                      "Email accepted by Resend but delivery ledger write failed: " +
                        messageError.message,
                    );
                  messageId = messageRow.id;
                }

                await supabaseAdmin.from("email_send_log").insert({
                  message_id: messageId ?? null,
                  template_name: "guest-request-update",
                  recipient_email: b.guest_email,
                  status: "sent",
                  metadata: {
                    booking_id: b.id,
                    request_id: guestRequest.id,
                    notification_id: job.id,
                    provider: "resend",
                    provider_message_id: sent.providerMessageId,
                  },
                });
                await supabaseAdmin.from("email_events").insert({
                  booking_id: b.id,
                  event_type: "guest_request_notification_sent",
                  template_name: "guest-request-update",
                  message_id: sent.providerMessageId,
                  recipient_email: b.guest_email,
                  metadata: {
                    request_id: guestRequest.id,
                    notification_id: job.id,
                    property_id: b.property_id,
                  },
                });
                if (messageId) {
                  await supabaseAdmin.from("ai_omnichannel_delivery_events").upsert(
                    {
                      property_id: b.property_id,
                      message_id: messageId,
                      channel: "email",
                      provider: "resend",
                      provider_event_id: `guest-request-${job.id}-sent`,
                      provider_message_id: sent.providerMessageId,
                      event_type: "sent",
                      occurred_at: sent.acceptedAt,
                      payload: { notification_id: job.id, request_id: guestRequest.id },
                    },
                    { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
                  );
                }
              }

              await supabaseAdmin
                .from("pending_notifications")
                .update({ processed_at: new Date().toISOString(), last_error: null })
                .eq("id", job.id);
              results.push({ id: job.id, ok: true, event: job.event_type });
              continue;
            }

            const snap = {
              reference: b.reference,
              guest_name: b.guest_name,
              room_name: room?.name ?? null,
              check_in: b.check_in,
              check_out: b.check_out,
              status: b.status,
              payment_status: b.payment_status,
              total: b.total,
              currency: b.currency,
              balance_amount: b.balance_amount,
              guest_type: b.guest_type,
              guest_phone: b.guest_phone,
            };

            const tpl = EMAIL_BY_EVENT[job.event_type];
            if (tpl) {
              await sendTransactionalInternal({
                templateName: tpl,
                recipientEmail: b.guest_email,
                idempotencyKey: `${tpl}-${b.id}`,
                bookingId: b.id,
                bcc: ["bookings@mtoniriverlodge.com"],
                templateData: {
                  reference: b.reference,
                  guestName: b.guest_name,
                  roomName: room?.name,
                  checkIn: b.check_in,
                  checkOut: b.check_out,
                  nights: b.nights,
                  adults: b.adults,
                  children: b.children ?? 0,
                  total: b.total,
                  deposit: b.deposit_amount,
                  balance: b.balance_amount,
                  currency: b.currency,
                },
              });
            }

            let message: string | null = null;
            switch (job.event_type) {
              case "booking_created":
                message = wt.newBookingMsg(snap);
                break;
              case "payment_paid":
                message = wt.paymentReceivedMsg(snap);
                break;
              case "payment_partial":
              case "payment_unpaid":
                message = wt.paymentPendingMsg(snap);
                break;
              case "status_cancelled":
                message = wt.bookingCancelledMsg(snap);
                break;
              case "status_checked_in":
                message = wt.checkInTodayMsg(snap);
                break;
              default:
                message = null;
            }
            if (job.event_type === "booking_created" && b.guest_type !== "standard") {
              await sendStaffWhatsApp({
                bookingId: b.id,
                eventType: "priority",
                idempotencyKey: `priority-${b.id}`,
                message: wt.vipPriorityMsg(snap),
              });
            }
            if (message) {
              await sendStaffWhatsApp({
                bookingId: b.id,
                eventType: job.event_type,
                idempotencyKey: `${job.event_type}-${b.id}`,
                message,
              });
            }

            await supabaseAdmin
              .from("pending_notifications")
              .update({ processed_at: new Date().toISOString() })
              .eq("id", job.id);
            results.push({ id: job.id, ok: true });
          } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            await supabaseAdmin
              .from("pending_notifications")
              .update({ attempts: (job.attempts ?? 0) + 1, last_error: errorMessage })
              .eq("id", job.id);
            results.push({ id: job.id, ok: false, error: errorMessage });
          }
        }
        return Response.json({ ok: true, processed: results.length, results });
      },
    },
  },
});
