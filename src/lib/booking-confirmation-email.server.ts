// Sends the "booking confirmed" email exactly once per booking.
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
  const { sendGmail, renderBookingConfirmed } = await import("./booking-email.server");
  const tpl = renderBookingConfirmed({
    reference: full.reference,
    guestName: full.guest_name,
    guestEmail: full.guest_email,
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
  });

  // Generate PDF invoice; if it fails, still send the email without it.
  let attachments: { filename: string; contentType: string; bytes: Uint8Array }[] | undefined;
  try {
    const { buildInvoiceForBooking } = await import("./booking-invoice.server");
    const invoice = await buildInvoiceForBooking(bookingId);
    if (invoice) {
      attachments = [{ filename: invoice.filename, contentType: "application/pdf", bytes: invoice.bytes }];
    }
  } catch (err) {
    console.error("[invoice] generation failed", err);
  }

  const sent = await sendGmail({ to: full.guest_email, ...tpl, attachments });
  await supabaseAdmin.from("payment_events").insert({
    booking_id: bookingId,
    provider: "gmail",
    event_type: sent.ok ? "email_confirmation_sent" : "email_confirmation_failed",
    raw: { messageId: sent.id ?? null, error: sent.error ?? null, invoiceAttached: !!attachments },
  });
  return sent;
}