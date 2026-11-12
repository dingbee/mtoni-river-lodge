import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { GUEST_REQUEST_CATEGORIES } from "@/domains/ai/concierge/request-categorization";
import { handleConciergeChat } from "@/domains/ai/concierge/concierge.server";
import { guestPortalOrigin, isGuestPortalStayEligible, validateGuestPortalPhotoMeta } from "./guest-portal.shared";

const BUCKET = "guest-request-evidence";
type GuestRequestAttachmentMeta = {
  path?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  file_size?: unknown;
};
type GuestRequestStatusHistoryMeta = {
  status?: unknown;
  note?: unknown;
  occurred_at?: unknown;
};

const categorySchema = z.enum(GUEST_REQUEST_CATEGORIES);

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function localDate(timezone: string | null | undefined): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function adminClient(): Promise<SupabaseClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function isRegisteredBookingGuest(
  admin: SupabaseClient,
  propertyId: string,
  bookingId: string,
  leadGuestId: string | null,
  guestId: string | null,
): Promise<boolean> {
  if (!guestId) return false;
  if (guestId === leadGuestId) return true;
  const { data, error } = await admin
    .from("staynas_booking_guest_occupants")
    .select("id")
    .eq("property_id", propertyId)
    .eq("booking_id", bookingId)
    .eq("guest_id", guestId)
    .eq("status", "active")
    .maybeSingle();
  return !error && Boolean(data);
}

type GuestPortalContext = {
  admin: SupabaseClient;
  access: {
    id: string;
    property_id: string;
    booking_id: string;
    guest_id: string | null;
    concierge_session_id: string | null;
    expires_at: string;
  };
  property: { id: string; name: string; timezone: string | null; currency: string | null };
  booking: {
    id: string;
    property_id: string;
    guest_id: string | null;
    guest_name: string;
    guest_email: string;
    guest_phone: string | null;
    reference: string;
    room_id: string;
    check_in: string;
    check_out: string;
    status: string;
    adults: number;
    children: number | null;
    checked_in_at: string | null;
  };
  room: { id: string; name: string; slug: string | null } | null;
  roomState: { id: string; state: string; unit_label: string | null } | null;
};

async function recordGuestPortalAccessDenied(
  admin: SupabaseClient,
  tokenFingerprint: string,
  reason: string,
  access?: {
    id: string;
    property_id: string;
    booking_id: string;
    guest_id: string | null;
  } | null,
): Promise<void> {
  try {
    await admin.from("staynas_guest_portal_access_events").insert({
      access_id: access?.id ?? null,
      property_id: access?.property_id ?? null,
      booking_id: access?.booking_id ?? null,
      guest_id: access?.guest_id ?? null,
      event_type: "access_denied",
      token_fingerprint: tokenFingerprint.slice(0, 12),
      metadata: { reason },
    });
  } catch {
    // Denial remains enforced even if security telemetry is unavailable.
  }
}

async function authorizeGuestPortal(token: string): Promise<GuestPortalContext> {
  const cleanToken = token.trim();
  const admin = await adminClient();
  const tokenHash = hashToken(cleanToken);
  if (cleanToken.length < 40 || cleanToken.length > 200) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "malformed_credential");
    throw new Error("This guest access link is invalid.");
  }

  const { data: access, error: accessError } = await admin
    .from("staynas_guest_portal_access")
    .select("id, property_id, booking_id, guest_id, concierge_session_id, token_hash, expires_at, revoked_at, status")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (accessError) throw new Error("Guest Portal access is temporarily unavailable.");
  const hashMatches = Boolean(
    access &&
    typeof access.token_hash === "string" &&
    /^[a-f0-9]{64}$/i.test(access.token_hash) &&
    timingSafeEqual(Buffer.from(access.token_hash, "hex"), Buffer.from(tokenHash, "hex")),
  );
  if (!access || !hashMatches) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "invalid_or_unknown_credential");
    throw new Error("This guest access link is invalid.");
  }
  if (access.status === "revoked" || access.status === "superseded" || (access.revoked_at && access.status !== "expired")) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "revoked_or_superseded_credential", access);
    throw new Error("This guest access link has been revoked.");
  }
  if (access.status === "expired" || Date.parse(access.expires_at) <= Date.now()) {
    if (access.status === "active") {
      await admin.from("staynas_guest_portal_access").update({ status: "expired" }).eq("id", access.id);
      await admin.from("staynas_guest_portal_access_events").insert({
        access_id: access.id,
        property_id: access.property_id,
        booking_id: access.booking_id,
        guest_id: access.guest_id,
        event_type: "expired",
        metadata: { source: "guest_access_validation" },
      });
    }
    await recordGuestPortalAccessDenied(admin, tokenHash, "expired_credential", access);
    throw new Error("This guest access link has expired.");
  }
  if (access.status !== "active") {
    await recordGuestPortalAccessDenied(admin, tokenHash, "credential_not_active", access);
    throw new Error("This guest access link is not active.");
  }

  const { data: property, error: propertyError } = await admin
    .from("staynas_properties")
    .select("id, name, timezone, currency")
    .eq("id", access.property_id)
    .eq("status", "active")
    .maybeSingle();
  if (propertyError || !property) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "property_unavailable", access);
    throw new Error("This property is not available.");
  }

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, property_id, guest_id, guest_name, guest_email, guest_phone, reference, room_id, check_in, check_out, status, adults, children, checked_in_at",
    )
    .eq("id", access.booking_id)
    .eq("property_id", access.property_id)
    .maybeSingle();

  if (bookingError || !booking || !isGuestPortalStayEligible(booking.status, access.expires_at)) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "booking_not_eligible", access);
    throw new Error("Guest Portal access is available during an active stay or its configured checkout grace period.");
  }
  if (!(await isRegisteredBookingGuest(admin, access.property_id, access.booking_id, booking.guest_id, access.guest_id))) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "guest_identity_mismatch", access);
    throw new Error("This guest access link does not match a registered reservation guest.");
  }
  const { data: portalGuest, error: portalGuestError } = await admin
    .from("guests")
    .select("id,full_name,email,phone_e164")
    .eq("id", access.guest_id)
    .maybeSingle();
  if (portalGuestError || !portalGuest) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "guest_profile_unavailable", access);
    throw new Error("The registered guest profile is not available.");
  }
  const portalBooking = access.guest_id === booking.guest_id ? booking : {
    ...booking,
    guest_name: portalGuest.full_name,
    guest_email: portalGuest.email,
    guest_phone: portalGuest.phone_e164,
  };

  const today = localDate(property.timezone);
  if (booking.status === "checked_in" && (booking.check_in > today || booking.check_out < today)) {
    await recordGuestPortalAccessDenied(admin, tokenHash, "outside_stay_dates", access);
    throw new Error(
      "Guest portal access is available only between the reservation check-in and check-out dates.",
    );
  }

  const { data: room } = await admin
    .from("rooms")
    .select("id, name, slug")
    .eq("id", booking.room_id)
    .eq("property_id", access.property_id)
    .maybeSingle();

  const { data: roomState } = await admin
    .from("room_states")
    .select("id, state, unit_label")
    .eq("booking_id", booking.id)
    .eq("property_id", access.property_id)
    .eq("room_id", booking.room_id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await admin
    .from("staynas_guest_portal_access")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", access.id)
    .eq("status", "active")
    .is("revoked_at", null);
  await admin.from("staynas_guest_portal_access_events").insert({
    access_id: access.id,
    property_id: access.property_id,
    booking_id: access.booking_id,
    guest_id: access.guest_id,
    event_type: "accessed",
    metadata: { source: "guest_portal" },
  });

  return {
    admin,
    access: {
      id: access.id,
      property_id: access.property_id,
      booking_id: access.booking_id,
      guest_id: access.guest_id,
      concierge_session_id: access.concierge_session_id,
      expires_at: access.expires_at,
    },
    property,
    booking: portalBooking,
    room: room ?? null,
    roomState: roomState ?? null,
  };
}

const portalTokenSchema = z.object({ token: z.string().min(40).max(200) });

export const getGuestPortalSnapshot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => portalTokenSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await authorizeGuestPortal(data.token);
    const { data: rows, error } = await ctx.admin
      .from("staynas_guest_requests")
      .select(
        "id, category, request_text, status, priority, status_note, created_at, updated_at, operational_task_id, metadata",
      )
      .eq("property_id", ctx.access.property_id)
      .eq("booking_id", ctx.access.booking_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Your requests could not be loaded.");

    const requests = await Promise.all(
      (rows ?? []).map(async (row) => {
        const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
        const rawAttachments: GuestRequestAttachmentMeta[] = Array.isArray(metadata.attachments)
          ? (metadata.attachments as GuestRequestAttachmentMeta[])
          : [];
        const attachments = await Promise.all(
          rawAttachments.map(async (item: GuestRequestAttachmentMeta) => {
            const path = typeof item?.path === "string" ? item.path : "";
            const prefix =
              ctx.access.property_id + "/" + ctx.access.booking_id + "/" + row.id + "/";
            if (!path.startsWith(prefix)) return null;
            const { data: signed } = await ctx.admin.storage
              .from(BUCKET)
              .createSignedUrl(path, 300);
            if (!signed?.signedUrl) return null;
            return {
              fileName: String(item.file_name ?? "Photograph"),
              mimeType: String(item.mime_type ?? "image/jpeg"),
              fileSize: Number(item.file_size ?? 0),
              url: signed.signedUrl,
            };
          }),
        );
        const history: GuestRequestStatusHistoryMeta[] = Array.isArray(metadata.status_history)
          ? (metadata.status_history as GuestRequestStatusHistoryMeta[])
          : [];
        return {
          id: row.id,
          category: row.category,
          requestText: row.request_text,
          status: row.status,
          priority: row.priority,
          statusNote: row.status_note,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          taskLinked: Boolean(row.operational_task_id),
          statusHistory: history.map((event: GuestRequestStatusHistoryMeta) => ({
            status: String(event.status ?? "received"),
            note: typeof event.note === "string" ? event.note : null,
            occurredAt: String(event.occurred_at ?? row.created_at),
          })),
          attachments: attachments.filter(
            (attachment): attachment is NonNullable<typeof attachment> => attachment !== null,
          ),
        };
      }),
    );

    return {
      property: { name: ctx.property.name, timezone: ctx.property.timezone },
      booking: {
        reference: ctx.booking.reference,
        guestName: ctx.booking.guest_name,
        roomName: ctx.room?.name ?? "Assigned room",
        unitLabel: ctx.roomState?.unit_label ?? null,
        checkIn: ctx.booking.check_in,
        checkOut: ctx.booking.check_out,
        adults: ctx.booking.adults,
        children: ctx.booking.children ?? 0,
      },
      requests,
      accessExpiresAt: ctx.access.expires_at,
    };
  });

const requestSchema = portalTokenSchema.extend({
  submissionId: z.string().uuid(),
  requestType: z.enum(["service", "issue"]),
  category: categorySchema,
  description: z.string().trim().min(3).max(1500),
  instructions: z.string().trim().max(500).optional().default(""),
  urgency: z.enum(["normal", "urgent"]).default("normal"),
});

export const submitGuestPortalRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await authorizeGuestPortal(data.token);
    const issueCategories = ["maintenance", "complaint", "service_recovery", "other"];
    if (data.requestType === "issue" && !issueCategories.includes(data.category)) {
      throw new Error("Choose an issue category to report a problem.");
    }
    if (
      data.requestType === "service" &&
      ["complaint", "service_recovery"].includes(data.category)
    ) {
      throw new Error("Choose Report an Issue for complaints or service recovery.");
    }

    const { data: existing } = await ctx.admin
      .from("staynas_guest_requests")
      .select("id, category, status, created_at")
      .eq("property_id", ctx.access.property_id)
      .eq("client_submission_id", data.submissionId)
      .maybeSingle();
    if (existing) return existing;

    const { data: roomState } = await ctx.admin
      .from("room_states")
      .select("id")
      .eq("booking_id", ctx.booking.id)
      .eq("property_id", ctx.access.property_id)
      .eq("room_id", ctx.booking.room_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data.category === "housekeeping" && !roomState?.id) {
      throw new Error(
        "Housekeeping cannot be dispatched until the assigned room state is available. Please contact reception.",
      );
    }

    const requestText =
      data.description.trim() +
      (data.instructions.trim() ? "\n\nGuest instructions: " + data.instructions.trim() : "");

    const payload = {
      property_id: ctx.access.property_id,
      booking_id: ctx.booking.id,
      guest_id: ctx.access.guest_id,
      session_id: ctx.access.concierge_session_id,
      room_state_id: roomState?.id ?? null,
      client_submission_id: data.submissionId,
      category: data.category,
      request_text: requestText,
      intake_channel: "web",
      priority: data.urgency === "urgent" ? 1 : 2,
      guest_name: ctx.booking.guest_name,
      guest_contact: ctx.booking.guest_email || ctx.booking.guest_phone,
      metadata: { source: "guest_portal", request_type: data.requestType },
      created_by: null,
    };

    const { data: inserted, error } = await ctx.admin
      .from("staynas_guest_requests")
      .upsert(payload, { onConflict: "property_id,client_submission_id", ignoreDuplicates: true })
      .select("id, category, status, created_at")
      .maybeSingle();

    if (error) throw new Error("Your request could not be submitted. Please try again.");
    if (inserted) return inserted;

    const { data: duplicate, error: duplicateError } = await ctx.admin
      .from("staynas_guest_requests")
      .select("id, category, status, created_at")
      .eq("property_id", ctx.access.property_id)
      .eq("client_submission_id", data.submissionId)
      .single();
    if (duplicateError || !duplicate)
      throw new Error("Your request could not be confirmed. Please refresh and check My Requests.");
    return duplicate;
  });

const photoUploadSchema = portalTokenSchema.extend({
  requestId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.string().min(3).max(100),
  fileSize: z
    .number()
    .int()
    .min(1)
    .max(8 * 1024 * 1024),
});

async function loadOwnedRequest(ctx: GuestPortalContext, requestId: string) {
  const { data: request, error } = await ctx.admin
    .from("staynas_guest_requests")
    .select("id, metadata, status")
    .eq("id", requestId)
    .eq("property_id", ctx.access.property_id)
    .eq("booking_id", ctx.access.booking_id)
    .maybeSingle();
  if (error || !request) throw new Error("Request not found for this stay.");
  if (["fulfilled", "cancelled"].includes(request.status)) {
    throw new Error("Photographs cannot be added to a closed request.");
  }
  return request;
}

export const createGuestRequestPhotoUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => photoUploadSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await authorizeGuestPortal(data.token);
    const request = await loadOwnedRequest(ctx, data.requestId);
    const metadata =
      request.metadata && typeof request.metadata === "object" ? request.metadata : {};
    const attachments = Array.isArray(metadata.attachments) ? metadata.attachments : [];
    if (attachments.length >= 6)
      throw new Error("A request can contain no more than six photographs.");
    const invalid = validateGuestPortalPhotoMeta(data.fileName, data.mimeType, data.fileSize);
    if (invalid) throw new Error(invalid);

    const extension = data.fileName.split(".").pop()?.toLowerCase() ?? "";
    const path = [
      ctx.access.property_id,
      ctx.access.booking_id,
      data.requestId,
      randomUUID() + "." + extension,
    ].join("/");

    const { data: signed, error } = await ctx.admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !signed?.token)
      throw new Error("Photo upload is temporarily unavailable. Please retry.");
    return { path, token: signed.token };
  });

const finalizePhotoSchema = photoUploadSchema.extend({ path: z.string().min(10).max(600) });

export const finalizeGuestRequestPhotoUpload = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => finalizePhotoSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await authorizeGuestPortal(data.token);
    const request = await loadOwnedRequest(ctx, data.requestId);
    const prefix =
      ctx.access.property_id + "/" + ctx.access.booking_id + "/" + data.requestId + "/";
    if (!data.path.startsWith(prefix) || data.path.includes("..")) {
      throw new Error("Photo does not belong to this guest request.");
    }
    const { data: blob, error: downloadError } = await ctx.admin.storage
      .from(BUCKET)
      .download(data.path);
    if (downloadError || !blob)
      throw new Error("The uploaded photograph could not be verified. Please retry.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== data.fileSize || bytes.length > 8 * 1024 * 1024) {
      await ctx.admin.storage.from(BUCKET).remove([data.path]);
      throw new Error("The uploaded photograph size did not match the selected file.");
    }

    const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng =
      bytes.length >= 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a;
    const isWebp =
      bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    const signatureMatches =
      (data.mimeType === "image/jpeg" && isJpeg) ||
      (data.mimeType === "image/png" && isPng) ||
      (data.mimeType === "image/webp" && isWebp);

    if (!signatureMatches) {
      await ctx.admin.storage.from(BUCKET).remove([data.path]);
      throw new Error("The uploaded photograph content does not match its file type.");
    }

    const { error: updateError } = await ctx.admin.rpc("staynas_guest_request_add_attachment", {
      _request_id: data.requestId,
      _property_id: ctx.access.property_id,
      _booking_id: ctx.access.booking_id,
      _attachment: {
        path: data.path,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: bytes.length,
        uploaded_at: new Date().toISOString(),
      },
    });
    if (updateError) {
      await ctx.admin.storage.from(BUCKET).remove([data.path]);
      throw new Error(
        "The photograph was uploaded but could not be attached to the request. Please retry.",
      );
    }

    return { ok: true };
  });

const conciergeChatSchema = portalTokenSchema.extend({
  message: z.string().trim().min(1).max(1000),
});

export const guestPortalConciergeChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => conciergeChatSchema.parse(input))
  .handler(async ({ data }) => {
    const ctx = await authorizeGuestPortal(data.token);
    if (!ctx.access.concierge_session_id) {
      throw new Error("Guest assistance is temporarily unavailable. Please contact reception.");
    }
    const { data: session, error } = await ctx.admin
      .from("ai_concierge_sessions")
      .select("session_token")
      .eq("id", ctx.access.concierge_session_id)
      .eq("property_id", ctx.access.property_id)
      .maybeSingle();
    if (error || !session?.session_token)
      throw new Error("Guest assistance is temporarily unavailable.");

    return handleConciergeChat(
      {
        message: data.message,
        session_token: session.session_token,
        page: "guest-portal",
        locale: "en",
      },
      { userAgent: null, referer: "/guest" },
      ctx.access.property_id,
    );
  });

const staffBookingSchema = z.object({
  bookingId: z.string().uuid(),
  guestId: z.string().uuid().optional(),
  rotate: z.boolean().optional().default(true),
});

async function requireReservationProperty(
  context: { supabase: SupabaseClient; userId: string },
  bookingId: string,
): Promise<string> {
  let founderAdmin = false;
  try {
    const { data, error } = await context.supabase.rpc("commercial_is_founder_admin", {
      _principal_id: context.userId,
    });
    founderAdmin = !error && data === true;
  } catch {
    founderAdmin = false;
  }

  if (!founderAdmin) {
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const { data: staff, error: staffError } = await context.supabase.rpc("is_any_staff", {
      _user_id: context.userId,
    });
    if (staffError || !staff) throw new Error("Staff access is required.");
    const { data: propertyId, error } = await context.supabase.rpc("staynas_active_property_id", {
      _uid: context.userId,
    });
    if (error || !propertyId) throw new Error("Select an active property first.");
    return String(propertyId);
  }

  // Founder scope is resolved from the reservation itself, never from a
  // property identifier supplied by the browser.
  const admin = await adminClient();
  const { data: booking, error } = await admin
    .from("bookings")
    .select("property_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error || !booking?.property_id) throw new Error("Booking not found.");
  return String(booking.property_id);
}

type GuestPortalIssueResult = {
  token: string | null;
  expiresAt: string;
  accessId: string;
  alreadyActive: boolean;
};

async function issueGuestPortalAccessForBooking(input: {
  propertyId: string;
  bookingId: string;
  actorId: string;
  rotate: boolean;
  guestId?: string;
}): Promise<GuestPortalIssueResult> {
  const admin = await adminClient();
  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select("id, property_id, guest_id, guest_name, guest_email, guest_phone, status")
    .eq("id", input.bookingId)
    .eq("property_id", input.propertyId)
    .maybeSingle();

  if (bookingError || !booking) throw new Error("Booking not found in the active property.");
  if (booking.status !== "checked_in") {
    throw new Error("Guest portal access can be issued only after the guest is checked in.");
  }
  const targetGuestId = input.guestId ?? booking.guest_id;
  if (!targetGuestId) {
    throw new Error("Register a guest profile before issuing Guest Portal access.");
  }
  if (targetGuestId !== booking.guest_id) {
    const { data: occupant, error: occupantError } = await admin
      .from("staynas_booking_guest_occupants")
      .select("id")
      .eq("property_id", input.propertyId)
      .eq("booking_id", booking.id)
      .eq("guest_id", targetGuestId)
      .eq("status", "active")
      .maybeSingle();
    if (occupantError || !occupant) {
      throw new Error("This guest is not a registered occupant of the reservation.");
    }
  }
  const { data: targetGuest, error: targetGuestError } = await admin
    .from("guests")
    .select("id, full_name, email, phone_e164")
    .eq("id", targetGuestId)
    .maybeSingle();
  if (targetGuestError || !targetGuest) throw new Error("Registered guest profile could not be verified.");

  if (!input.rotate) {
    const { data: existing, error: existingError } = await admin
      .from("staynas_guest_portal_access")
      .select("id, expires_at")
      .eq("property_id", input.propertyId)
      .eq("booking_id", booking.id)
      .eq("guest_id", targetGuestId)
      .eq("status", "active")
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error("Guest access status could not be verified.");
    if (existing) {
      return {
        token: null,
        expiresAt: existing.expires_at,
        accessId: existing.id,
        alreadyActive: true,
      };
    }
  }

  const token = randomBytes(32).toString("base64url");
  const sessionToken = "cnc_" + randomBytes(32).toString("base64url");
  const { data: session, error: sessionError } = await admin
    .from("ai_concierge_sessions")
    .insert({
      session_token: sessionToken,
      property_id: input.propertyId,
      guest_id: targetGuestId,
      guest_name: targetGuest.full_name || booking.guest_name || "Guest",
      guest_email: targetGuest.email ?? null,
      guest_phone: targetGuest.phone_e164 ?? null,
      channel: "web",
      page_context: { page: "guest_portal", booking_id: booking.id },
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    await admin.from("staynas_guest_portal_access_events").insert({
      property_id: input.propertyId,
      booking_id: booking.id,
      guest_id: targetGuestId,
      actor_id: input.actorId,
      event_type: "issue_failed",
      metadata: { phase: "session_preparation" },
    });
    throw new Error("Guest assistance session could not be prepared.");
  }

  const { data: issued, error: issueError } = await admin.rpc(
    "staynas_issue_guest_portal_access",
    {
      _property_id: input.propertyId,
      _booking_id: booking.id,
      _guest_id: targetGuestId,
      _concierge_session_id: session.id,
      _token_hash: hashToken(token),
      _actor_id: input.actorId,
      _rotate: input.rotate,
    },
  );

  if (issueError || !issued?.access_id || !issued?.expires_at) {
    await admin.from("ai_concierge_sessions").delete().eq("id", session.id);
    await admin.from("staynas_guest_portal_access_events").insert({
      property_id: input.propertyId,
      booking_id: booking.id,
      guest_id: targetGuestId,
      actor_id: input.actorId,
      event_type: "issue_failed",
      metadata: { phase: "credential_rpc" },
    });
    throw new Error("Guest portal access could not be issued. The previous credential remains valid.");
  }

  if (issued.already_active) {
    await admin.from("ai_concierge_sessions").delete().eq("id", session.id);
    return {
      token: null,
      expiresAt: String(issued.expires_at),
      accessId: String(issued.access_id),
      alreadyActive: true,
    };
  }

  return {
    token,
    expiresAt: String(issued.expires_at),
    accessId: String(issued.access_id),
    alreadyActive: false,
  };
}

export const getGuestPortalAccessStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid(), guestId: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const admin = await adminClient();
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, property_id, guest_id, guest_name, reference, room_id, check_in, check_out, status")
      .eq("id", data.bookingId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (bookingError || !booking) throw new Error("Booking not found in the active property.");

    const targetGuestId = data.guestId ?? booking.guest_id;
    if (!targetGuestId) throw new Error("The reservation has no registered lead guest.");
    if (targetGuestId !== booking.guest_id) {
      const { data: occupant, error: occupantError } = await admin
        .from("staynas_booking_guest_occupants")
        .select("id")
        .eq("property_id", propertyId)
        .eq("booking_id", data.bookingId)
        .eq("guest_id", targetGuestId)
        .eq("status", "active")
        .maybeSingle();
      if (occupantError || !occupant) throw new Error("Guest is not an active registered occupant of this reservation.");
    }
    const [accessResult, propertyResult, roomResult, eventsResult, guestResult] = await Promise.all([
      admin
        .from("staynas_guest_portal_access")
        .select("id, guest_id, status, expires_at, created_at, created_by, last_used_at, revoked_at")
        .eq("booking_id", data.bookingId)
        .eq("property_id", propertyId)
        .eq("guest_id", targetGuestId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("staynas_properties").select("name, timezone").eq("id", propertyId).maybeSingle(),
      admin.from("rooms").select("name").eq("id", booking.room_id).eq("property_id", propertyId).maybeSingle(),
      admin
        .from("staynas_guest_portal_access_events")
        .select("id, event_type, actor_id, metadata, created_at")
        .eq("booking_id", data.bookingId)
        .eq("property_id", propertyId)
        .eq("guest_id", targetGuestId)
        .order("created_at", { ascending: false })
        .limit(25),
      admin.from("guests").select("id,full_name").eq("id", targetGuestId).maybeSingle(),
    ]);

    if (accessResult.error || eventsResult.error) {
      throw new Error("Guest portal access history could not be loaded.");
    }
    const access = accessResult.data;
    let deliveryStatus = "not_sent";
    let deliveryDraftId: string | null = null;
    if (access) {
      const { data: deliveryDrafts, error: deliveryDraftError } = await admin
        .from("ai_communication_drafts")
        .select("id,created_at")
        .eq("booking_id", data.bookingId)
        .contains("supporting_context", { guest_portal_access_id: access.id })
        .order("created_at", { ascending: false })
        .limit(5);
      if (deliveryDraftError) {
        deliveryStatus = "unknown";
      } else if (deliveryDrafts?.length) {
        deliveryDraftId = deliveryDrafts[0].id;
        deliveryStatus = "draft";
        const { data: attempts, error: attemptsError } = await admin
          .from("ai_communication_dispatch_attempts")
          .select("id,draft_id,message_id,status,attempt_number,started_at,finished_at")
          .eq("property_id", propertyId)
          .eq("draft_id", deliveryDraftId)
          .order("started_at", { ascending: false })
          .limit(10);
        if (attemptsError) {
          deliveryStatus = "unknown";
        } else if (attempts?.length) {
          const latestAttempt = attempts[0];
          const attemptStatus = String(latestAttempt.status);
          deliveryStatus = attemptStatus === "accepted"
            ? "sent"
            : attemptStatus === "processing"
              ? "queued"
              : attemptStatus === "retryable_failure"
                ? "retrying"
                : ["permanent_failure", "cancelled"].includes(attemptStatus)
                  ? "failed"
                  : "draft";
          if (latestAttempt.message_id) {
            const { data: deliveryEvents } = await admin
              .from("ai_omnichannel_delivery_events")
              .select("event_type")
              .eq("property_id", propertyId)
              .eq("message_id", latestAttempt.message_id)
              .order("occurred_at", { ascending: false })
              .limit(1);
            const eventType = deliveryEvents?.[0]?.event_type;
            if (eventType === "delivered" || eventType === "read") deliveryStatus = "delivered";
            else if (["bounced", "rejected", "failed", "complained"].includes(String(eventType))) deliveryStatus = "failed";
          }
        }
      }
    }
    const expired = Boolean(
      access && (access.status === "expired" || Date.parse(access.expires_at) <= Date.now()),
    );
    const status = access?.status === "superseded"
      ? "superseded"
      : access?.status === "revoked" || (access?.revoked_at && !expired)
        ? "revoked"
        : expired
          ? "expired"
          : access?.status ?? "not_issued";

    return {
      eligible: booking.status === "checked_in",
      active: status === "active",
      status,
      accessId: access?.id ?? null,
      guestId: targetGuestId,
      guestName: guestResult.data?.full_name ?? booking.guest_name,
      reservationReference: booking.reference,
      propertyName: propertyResult.data?.name ?? "Property",
      timezone: propertyResult.data?.timezone ?? "UTC",
      roomName: roomResult.data?.name ?? null,
      createdAt: access?.created_at ?? null,
      expiresAt: access?.expires_at ?? null,
      createdBy: access?.created_by ?? null,
      lastUsedAt: access?.last_used_at ?? null,
      events: eventsResult.data ?? [],
      deliveryStatus,
      deliveryDraftId,
      multipleGuestAccess: true,
    };
  });

const guestPortalDeliveryDraftSchema = z.object({
  bookingId: z.string().uuid(),
  accessId: z.string().uuid(),
  channel: z.enum(["whatsapp", "email"]),
  portalUrl: z.string().url().max(2048),
});

export const prepareGuestPortalDeliveryDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guestPortalDeliveryDraftSchema.parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    await requireStayNasModuleAccess(context.supabase, context.userId, "reservations");
    const { data: membership, error: membershipError } = await context.supabase
      .from("staynas_property_members")
      .select("role")
      .eq("property_id", propertyId)
      .eq("user_id", context.userId)
      .eq("status", "active")
      .in("role", ["owner", "manager", "admin"])
      .maybeSingle();
    if (membershipError || !membership) throw new Error("Property manager authorization is required to prepare guest delivery.");

    const admin = await adminClient();
    const [{ data: access, error: accessError }, { data: booking, error: bookingError }] = await Promise.all([
      admin.from("staynas_guest_portal_access")
        .select("id,property_id,booking_id,guest_id,concierge_session_id,status,revoked_at,expires_at")
        .eq("id", data.accessId).eq("property_id", propertyId).eq("booking_id", data.bookingId).maybeSingle(),
      admin.from("bookings")
        .select("id,property_id,guest_id,guest_name,status")
        .eq("id", data.bookingId).eq("property_id", propertyId).maybeSingle(),
    ]);
    if (accessError || !access || access.status !== "active" || access.revoked_at || Date.parse(access.expires_at) <= Date.now()) {
      throw new Error("Only an active, unexpired guest credential can be prepared for delivery.");
    }
    if (bookingError || !booking || !isGuestPortalStayEligible(booking.status, access.expires_at)) {
      throw new Error("The reservation is not eligible for Guest Portal delivery.");
    }
    if (!(await isRegisteredBookingGuest(admin, propertyId, data.bookingId, booking.guest_id, access.guest_id))) {
      throw new Error("The credential is not bound to a registered reservation guest.");
    }
    const parsedUrl = new URL(data.portalUrl);
    const approvedOrigin = guestPortalOrigin(parsedUrl.origin, import.meta.env.VITE_GUEST_PORTAL_BASE_URL);
    if (approvedOrigin !== parsedUrl.origin || !/^\/guest\/[A-Za-z0-9_-]{40,200}$/.test(parsedUrl.pathname) || parsedUrl.search || parsedUrl.hash) {
      throw new Error("Only the canonical approved Guest Portal URL can be sent.");
    }
    const { data: session, error: sessionError } = await admin
      .from("ai_concierge_sessions")
      .select("id,property_id,guest_id,guest_name,guest_email,guest_phone")
      .eq("id", access.concierge_session_id)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (sessionError || !session || session.guest_id !== access.guest_id) {
      throw new Error("The guest delivery conversation could not be verified.");
    }
    const provider = data.channel === "whatsapp" ? "meta_cloud_api" : "resend";
    const contact = data.channel === "whatsapp" ? session.guest_phone : session.guest_email;
    if (typeof contact !== "string" || !contact.trim()) {
      throw new Error("The registered guest has no contact address for this channel.");
    }
    if (data.channel === "whatsapp" && !/^\+[1-9]\d{7,14}$/.test(contact.trim())) {
      throw new Error("The registered guest has no valid WhatsApp E.164 number.");
    }
    const { data: conciergeChannel, error: conciergeChannelError } = await admin
      .from("ai_concierge_channels")
      .select("id")
      .eq("channel", data.channel)
      .eq("provider", provider)
      .eq("status", "active")
      .eq("outbound_enabled", true)
      .maybeSingle();
    if (conciergeChannelError || !conciergeChannel) {
      throw new Error("The selected messaging provider channel is not active for outbound dispatch.");
    }
    const { data: settings, error: settingsError } = await admin
      .from("ai_property_channel_settings")
      .select("enabled,outbound_enabled,sender_email")
      .eq("property_id", propertyId)
      .eq("channel", data.channel)
      .maybeSingle();
    if (settingsError || !settings?.enabled || !settings?.outbound_enabled) {
      throw new Error("Outbound delivery is not enabled for this property channel.");
    }
    if (data.channel === "email" && !settings.sender_email) {
      throw new Error("A property-specific email sender must be configured before preparing delivery.");
    }
    let bindingQuery = admin.from("ai_provider_property_bindings")
      .select("id,external_endpoint_id")
      .eq("property_id", propertyId)
      .eq("provider", provider)
      .eq("enabled", true)
      .eq("outbound_enabled", true)
      .eq("verification_status", "verified");
    if (data.channel === "email") bindingQuery = bindingQuery.eq("external_endpoint_id", settings.sender_email);
    const { data: binding, error: bindingError } = await bindingQuery.limit(1).maybeSingle();
    if (bindingError || !binding) throw new Error("No verified outbound provider binding is configured for this property.");

    const { data: existingDraft, error: existingDraftError } = await admin
      .from("ai_communication_drafts")
      .select("id")
      .eq("booking_id", data.bookingId)
      .eq("channel", data.channel)
      .in("status", ["pending", "approved", "sent"])
      .contains("supporting_context", { guest_portal_access_id: access.id })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingDraftError) throw new Error("Existing Guest Portal delivery drafts could not be checked.");
    if (existingDraft) return { id: existingDraft.id, channel: data.channel, alreadyExists: true };

    const guestName = String(session.guest_name || booking.guest_name || "Guest");
    const expiry = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })
      .format(new Date(access.expires_at));
    const subject = "Your StayNas Guest Portal access";
    const body = `Hello ${guestName},\n\nYour private Guest Portal link is ready:\n${data.portalUrl}\n\nThis link expires ${expiry} (UTC). Please keep it private and do not forward it.\n\nThe property team`;
    const { data: draft, error: draftError } = await admin.from("ai_communication_drafts")
      .insert({
        session_id: session.id,
        guest_id: access.guest_id,
        booking_id: data.bookingId,
        channel: data.channel,
        draft_type: "concierge_response",
        subject: data.channel === "email" ? subject : null,
        body,
        reasoning: "Guest Portal credential delivery. Dispatch remains subject to staff approval, guest consent, and the property's provider policy.",
        supporting_context: {
          source: "guest_portal_access",
          guest_portal_access_id: access.id,
          credential_expires_at: access.expires_at,
          provider_binding_id: binding.id,
        },
        status: "pending",
        notes: "Review recipient, content, consent and provider template requirements before dispatch.",
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (draftError || !draft) throw new Error("The Guest Portal delivery draft could not be created.");
    return { id: draft.id, channel: data.channel };
  });

type GuestPortalOccupantRow = { guest_id: string; status: string; created_at: string };
type GuestPortalPropertyBookingRow = { guest_id: string | null };
type GuestPortalGuestProfile = {
  id: string;
  full_name: string | null;
  email?: string | null;
  phone_e164?: string | null;
};

export const listGuestPortalOccupants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const admin = await adminClient();
    const [{ data: booking, error: bookingError }, { data: relations, error: relationError }, { data: propertyBookings, error: propertyBookingsError }] = await Promise.all([
      admin.from("bookings").select("id,guest_id,guest_name").eq("id", data.bookingId).eq("property_id", propertyId).maybeSingle(),
      admin.from("staynas_booking_guest_occupants").select("guest_id,status,created_at").eq("property_id", propertyId).eq("booking_id", data.bookingId).eq("status", "active").order("created_at"),
      admin.from("bookings").select("guest_id").eq("property_id", propertyId).not("guest_id", "is", null).limit(500),
    ]);
    if (bookingError || !booking || relationError || propertyBookingsError) throw new Error("Registered reservation guests could not be loaded.");
    const occupantIds = (relations ?? []).map((row: GuestPortalOccupantRow) => row.guest_id);
    const availableIds = [...new Set((propertyBookings ?? []).map((row: GuestPortalPropertyBookingRow) => row.guest_id).filter((id): id is string => Boolean(id)))]
      .filter((id: string) => id !== booking.guest_id && !occupantIds.includes(id));
    const allIds = [...new Set([booking.guest_id, ...occupantIds, ...availableIds].filter((id): id is string => Boolean(id)))];
    const { data: profiles, error: profileError } = allIds.length
      ? await admin.from("guests").select("id,full_name,email,phone_e164").in("id", allIds)
      : { data: [], error: null };
    if (profileError) throw new Error("Registered guest profiles could not be loaded.");
    const byId = new Map<string, GuestPortalGuestProfile>(
      (profiles ?? []).map((profile: GuestPortalGuestProfile) => [profile.id, profile] as const),
    );
    return {
      leadGuest: booking.guest_id
        ? byId.get(booking.guest_id) ?? { id: booking.guest_id, full_name: booking.guest_name }
        : null,
      occupants: (relations ?? []).map((row: GuestPortalOccupantRow) => {
        const profile = byId.get(row.guest_id);
        return {
          id: row.guest_id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone_e164: profile?.phone_e164 ?? null,
          addedAt: row.created_at,
        };
      }),
      availableGuests: availableIds.flatMap((id: string) => {
        const profile = byId.get(id);
        return profile ? [profile] : [];
      }),
    };
  });

export const addGuestPortalOccupant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid(), guestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const admin = await adminClient();
    const { data: booking, error: bookingError } = await admin.from("bookings")
      .select("id,guest_id,status").eq("id", data.bookingId).eq("property_id", propertyId).maybeSingle();
    if (bookingError || !booking || booking.status !== "checked_in") throw new Error("Occupants can only be managed during a checked-in stay.");
    if (booking.guest_id === data.guestId) throw new Error("The lead guest is already registered on this reservation.");
    const { data: knownGuest, error: knownGuestError } = await admin.from("bookings")
      .select("id").eq("property_id", propertyId).eq("guest_id", data.guestId).limit(1).maybeSingle();
    if (knownGuestError || !knownGuest) throw new Error("Only guest profiles already registered with this property can be added.");
    const { error } = await admin.from("staynas_booking_guest_occupants").upsert({
      property_id: propertyId, booking_id: data.bookingId, guest_id: data.guestId,
      status: "active", created_by: context.userId,
    }, { onConflict: "property_id,booking_id,guest_id" });
    if (error) throw new Error("Registered occupant could not be added.");
    await admin.from("staynas_guest_portal_access_events").insert({
      property_id: propertyId, booking_id: data.bookingId, guest_id: data.guestId,
      actor_id: context.userId, event_type: "occupant_added", metadata: {},
    });
    return { ok: true };
  });

export const removeGuestPortalOccupant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ bookingId: z.string().uuid(), guestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const admin = await adminClient();
    const { data: booking, error: bookingError } = await admin.from("bookings")
      .select("id,guest_id").eq("id", data.bookingId).eq("property_id", propertyId).maybeSingle();
    if (bookingError || !booking || booking.guest_id === data.guestId) throw new Error("Lead guest access cannot be removed as an occupant.");
    const { error } = await admin.from("staynas_booking_guest_occupants").update({ status: "removed" })
      .eq("property_id", propertyId).eq("booking_id", data.bookingId).eq("guest_id", data.guestId).eq("status", "active");
    if (error) throw new Error("Registered occupant could not be removed.");
    const { error: revokeError } = await admin.rpc("staynas_revoke_guest_portal_access", {
      _property_id: propertyId, _booking_id: data.bookingId, _guest_id: data.guestId, _actor_id: context.userId,
    });
    if (revokeError) throw new Error("Occupant was removed, but its guest access could not be revoked.");
    await admin.from("staynas_guest_portal_access_events").insert({
      property_id: propertyId, booking_id: data.bookingId, guest_id: data.guestId,
      actor_id: context.userId, event_type: "occupant_removed", metadata: {},
    });
    return { ok: true };
  });

export const issueGuestPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffBookingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const result = await issueGuestPortalAccessForBooking({
      propertyId,
      bookingId: data.bookingId,
      actorId: context.userId,
      rotate: data.rotate,
      guestId: data.guestId,
    });
    return result;
  });

export const revokeGuestPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bookingId: z.string().uuid(), guestId: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context, data.bookingId);
    const admin = await adminClient();
    const { data: count, error } = await admin.rpc("staynas_revoke_guest_portal_access", {
      _property_id: propertyId,
      _booking_id: data.bookingId,
      _guest_id: data.guestId ?? null,
      _actor_id: context.userId,
    });
    if (error) throw new Error("Guest portal access could not be revoked.");
    return { ok: true, revokedCount: Number(count ?? 0) };
  });

const guestPortalEventSchema = z.object({
  bookingId: z.string().uuid(),
  accessId: z.string().uuid(),
  eventType: z.enum(["qr_generated", "qr_generation_failed", "link_shared"]),
});

export const recordGuestPortalAccessEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guestPortalEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    let propertyId: string;
    try {
      propertyId = await requireReservationProperty(context, data.bookingId);
    } catch {
      await requireStayNasModuleAccess(context.supabase, context.userId, "operations");
      const { data: staff, error: staffError } = await context.supabase.rpc("is_any_staff", {
        _user_id: context.userId,
      });
      const { data: activePropertyId, error: propertyError } = await context.supabase.rpc(
        "staynas_active_property_id",
        { _uid: context.userId },
      );
      if (staffError || !staff || propertyError || !activePropertyId) {
        throw new Error("Guest access event recording is not authorized.");
      }
      propertyId = String(activePropertyId);
    }
    const admin = await adminClient();
    const { data: access, error: accessError } = await admin
      .from("staynas_guest_portal_access")
      .select("id, booking_id, guest_id, status, revoked_at, expires_at")
      .eq("id", data.accessId)
      .eq("booking_id", data.bookingId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (accessError || !access || access.status !== "active" || access.revoked_at ||
        Date.parse(access.expires_at) <= Date.now()) {
      throw new Error("The guest credential is no longer active.");
    }
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("status, guest_id")
      .eq("id", data.bookingId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (bookingError || !booking ||
        !isGuestPortalStayEligible(booking.status, access.expires_at) ||
        !(await isRegisteredBookingGuest(admin, propertyId, data.bookingId, booking.guest_id, access.guest_id))) {
      throw new Error("The guest credential is no longer bound to an eligible registered guest stay.");
    }
    const { error } = await admin.from("staynas_guest_portal_access_events").insert({
      access_id: access.id,
      property_id: propertyId,
      booking_id: data.bookingId,
      guest_id: access.guest_id,
      actor_id: context.userId,
      event_type: data.eventType,
      metadata: { source: "reservation_access_panel" },
    });
    if (error) throw new Error("Guest access event could not be recorded.");
    return { ok: true };
  });
