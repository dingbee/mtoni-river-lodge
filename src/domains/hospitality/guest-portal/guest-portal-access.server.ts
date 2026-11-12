import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes } from "node:crypto";

async function adminClient(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Idempotent post-check-in issuance. The bearer token is returned only to the
 * authenticated check-in response; only its SHA-256 digest is persisted.
 */
export async function ensureGuestPortalAccessAfterCheckIn(
  supabase: SupabaseClient,
  actorId: string,
  bookingId: string,
): Promise<{
  issued: boolean;
  alreadyActive: boolean;
  expiresAt: string | null;
  token: string | null;
  accessId: string;
}> {
  const { data: propertyId, error: propertyError } = await supabase.rpc("staynas_active_property_id", {
    _uid: actorId,
  });
  if (propertyError || !propertyId) {
    throw new Error("Active property could not be resolved for guest access.");
  }

  const admin = await adminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, property_id, guest_id, guest_name, guest_email, guest_phone, status")
    .eq("id", bookingId)
    .eq("property_id", propertyId)
    .maybeSingle();

  if (bookingError || !booking || booking.status !== "checked_in") {
    throw new Error("Guest access requires a successfully checked-in booking.");
  }

  const { data: existing, error: existingError } = await admin
    .from("staynas_guest_portal_access")
    .select("id, expires_at")
    .eq("property_id", propertyId)
    .eq("booking_id", bookingId)
    .is("guest_id", booking.guest_id)
    .eq("status", "active")
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) throw new Error("Existing guest access could not be verified.");
  if (existing) {
    return {
      issued: false,
      alreadyActive: true,
      expiresAt: existing.expires_at,
      token: null,
      accessId: existing.id,
    };
  }

  const token = randomBytes(32).toString("base64url");
  const sessionToken = "cnc_" + randomBytes(32).toString("base64url");
  const { data: session, error: sessionError } = await admin
    .from("ai_concierge_sessions")
    .insert({
      session_token: sessionToken,
      property_id: propertyId,
      guest_id: booking.guest_id,
      guest_name: booking.guest_name || "Guest",
      guest_email: booking.guest_email,
      guest_phone: booking.guest_phone,
      channel: "web",
      page_context: { page: "guest_portal", booking_id: booking.id },
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    throw new Error("Guest assistance session could not be prepared.");
  }

  const { data: issued, error: issueError } = await admin.rpc("staynas_issue_guest_portal_access", {
    _property_id: propertyId,
    _booking_id: booking.id,
    _guest_id: booking.guest_id,
    _concierge_session_id: session.id,
    _token_hash: hashToken(token),
    _actor_id: actorId,
    _rotate: false,
  });

  if (issueError || !issued?.access_id || !issued?.expires_at) {
    await admin.from("ai_concierge_sessions").delete().eq("id", session.id);
    throw new Error("Guest Portal access issuance failed after check-in.");
  }

  if (issued.already_active) {
    await admin.from("ai_concierge_sessions").delete().eq("id", session.id);
    return {
      issued: false,
      alreadyActive: true,
      expiresAt: String(issued.expires_at),
      token: null,
      accessId: String(issued.access_id),
    };
  }

  return {
    issued: true,
    alreadyActive: false,
    expiresAt: String(issued.expires_at),
    token,
    accessId: String(issued.access_id),
  };
}
