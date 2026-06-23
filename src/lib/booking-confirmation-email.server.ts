// Sends the "booking confirmed" email exactly once per booking via Lovable Emails.
// Idempotency is enforced by inserting a marker row into payment_events
// with a unique (booking_id, event_type) constraint-free check.

export async function sendBookingConfirmedEmail(bookingId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Idempotency: have we already sent?
  const { data: existing } = await supabaseAdmin
    .from("payment_events")
    .select("id")
    .eq("booking_id", bookingId)
    .eq("event_type", "email_confirmation_sent")
    .limit(1)
    .maybeSingle();
  if (existing) return { ok: true, skipped: true as const };

  const { data: full } = await supabaseAdmin
    .from("bookings")
    .select("reference, guest_name, guest_email, check_in, check_out, nights, adults, children, total, deposit_amount, balance_amount, currency, room_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!full) return { ok: false, error: "booking not found" };

  const { data: room } = await supabaseAdmin.from("rooms").select("name").eq("id", full.room_id).maybeSingle();
  const { sendTransactionalInternal } = await import("./email/send-internal.server");
  const sent = await sendTransactionalInternal({
    templateName: "booking-confirmed",
    recipientEmail: full.guest_email,
    idempotencyKey: `booking-confirmed-${bookingId}`,
    templateData: {
      reference: full.reference,
      guestName: full.guest_name,
      roomName: room?.name,
      checkIn: full.check_in,
      checkOut: full.check_out,
      nights: full.nights,
      adults: full.adults,
      children: full.children ?? 0,
      total: full.total,
      deposit: full.deposit_amount,
      balance: full.balance_amount,
      currency: full.currency,
    },
  });

  await supabaseAdmin.from("payment_events").insert({
    booking_id: bookingId,
    provider: "lovable-emails",
    event_type: sent.ok ? "email_confirmation_sent" : "email_confirmation_failed",
    raw: {
      messageId: sent.ok ? sent.messageId : null,
      error: sent.ok ? null : sent.error ?? sent.reason,
    },
  });
  return sent;
}