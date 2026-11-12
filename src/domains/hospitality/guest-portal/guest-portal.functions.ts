import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { GUEST_REQUEST_CATEGORIES } from "@/domains/ai/concierge/request-categorization";
import { handleConciergeChat } from "@/domains/ai/concierge/concierge.server";
import { validateGuestPortalPhotoMeta } from "./guest-portal.shared";

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

async function authorizeGuestPortal(token: string): Promise<GuestPortalContext> {
  const cleanToken = token.trim();
  if (cleanToken.length < 40 || cleanToken.length > 200) {
    throw new Error("This guest access link is invalid.");
  }

  const admin = await adminClient();
  const { data: access, error: accessError } = await admin
    .from("staynas_guest_portal_access")
    .select("id, property_id, booking_id, guest_id, concierge_session_id, expires_at, revoked_at, status")
    .eq("token_hash", hashToken(cleanToken))
    .maybeSingle();

  if (accessError || !access) throw new Error("This guest access link is invalid.");
  if (access.revoked_at || access.status === "revoked" || access.status === "superseded") {
    throw new Error("This guest access link has been revoked.");
  }
  if (access.status !== "active" || Date.parse(access.expires_at) <= Date.now()) {
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
    throw new Error("This guest access link has expired.");
  }

  const { data: property, error: propertyError } = await admin
    .from("staynas_properties")
    .select("id, name, timezone, currency")
    .eq("id", access.property_id)
    .eq("status", "active")
    .maybeSingle();
  if (propertyError || !property) throw new Error("This property is not available.");

  const { data: booking, error: bookingError } = await admin
    .from("bookings")
    .select(
      "id, property_id, guest_id, guest_name, guest_email, guest_phone, reference, room_id, check_in, check_out, status, adults, children, checked_in_at",
    )
    .eq("id", access.booking_id)
    .eq("property_id", access.property_id)
    .maybeSingle();

  if (bookingError || !booking || booking.status !== "checked_in") {
    throw new Error("Guest portal access is available only during an active checked-in stay.");
  }
  if (access.guest_id && booking.guest_id && access.guest_id !== booking.guest_id) {
    throw new Error("This guest access link does not match the reservation.");
  }
  const today = localDate(property.timezone);
  if (booking.check_in > today || booking.check_out < today) {
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
    booking,
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
      guest_id: ctx.booking.guest_id,
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
  rotate: z.boolean().optional().default(true),
});

async function requireReservationProperty(context: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string> {
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

  if (!input.rotate) {
    const { data: existing, error: existingError } = await admin
      .from("staynas_guest_portal_access")
      .select("id, expires_at")
      .eq("property_id", input.propertyId)
      .eq("booking_id", booking.id)
      .is("guest_id", booking.guest_id)
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
      guest_id: booking.guest_id,
      guest_name: booking.guest_name,
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

  const { data: issued, error: issueError } = await admin.rpc(
    "staynas_issue_guest_portal_access",
    {
      _property_id: input.propertyId,
      _booking_id: booking.id,
      _guest_id: booking.guest_id,
      _concierge_session_id: session.id,
      _token_hash: hashToken(token),
      _actor_id: input.actorId,
    },
  );

  if (issueError || !issued?.access_id || !issued?.expires_at) {
    await admin.from("ai_concierge_sessions").delete().eq("id", session.id);
    throw new Error("Guest portal access could not be issued. The previous credential remains valid.");
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
  .inputValidator((input: unknown) => staffBookingSchema.pick({ bookingId: true }).parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context);
    const admin = await adminClient();
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("id, property_id, guest_id, guest_name, reference, room_id, check_in, check_out, status")
      .eq("id", data.bookingId)
      .eq("property_id", propertyId)
      .maybeSingle();
    if (bookingError || !booking) throw new Error("Booking not found in the active property.");

    const [accessResult, propertyResult, roomResult, eventsResult] = await Promise.all([
      admin
        .from("staynas_guest_portal_access")
        .select("id, guest_id, status, expires_at, created_at, created_by, last_used_at, revoked_at")
        .eq("booking_id", data.bookingId)
        .eq("property_id", propertyId)
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
        .order("created_at", { ascending: false })
        .limit(25),
    ]);

    if (accessResult.error || eventsResult.error) {
      throw new Error("Guest portal access history could not be loaded.");
    }
    const access = accessResult.data;
    const expired = Boolean(access && Date.parse(access.expires_at) <= Date.now() && !access.revoked_at);
    const status = access?.revoked_at
      ? (access.status === "superseded" ? "superseded" : "revoked")
      : expired
        ? "expired"
        : access?.status ?? "not_issued";

    return {
      eligible: booking.status === "checked_in",
      active: status === "active",
      status,
      accessId: access?.id ?? null,
      guestId: booking.guest_id,
      guestName: booking.guest_name,
      reservationReference: booking.reference,
      propertyName: propertyResult.data?.name ?? "Property",
      timezone: propertyResult.data?.timezone ?? "UTC",
      roomName: roomResult.data?.name ?? null,
      createdAt: access?.created_at ?? null,
      expiresAt: access?.expires_at ?? null,
      createdBy: access?.created_by ?? null,
      lastUsedAt: access?.last_used_at ?? null,
      events: eventsResult.data ?? [],
      deliveryStatus: "not_sent",
      multipleGuestAccess: false,
    };
  });

export const issueGuestPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => staffBookingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context);
    const result = await issueGuestPortalAccessForBooking({
      propertyId,
      bookingId: data.bookingId,
      actorId: context.userId,
      rotate: data.rotate,
    });
    return result;
  });

export const revokeGuestPortalAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bookingId: z.string().uuid(), guestId: z.string().uuid().nullable().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const propertyId = await requireReservationProperty(context);
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
  eventType: z.enum(["qr_generated", "link_shared"]),
});

export const recordGuestPortalAccessEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => guestPortalEventSchema.parse(input))
  .handler(async ({ data, context }) => {
    let propertyId: string;
    try {
      propertyId = await requireReservationProperty(context);
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
