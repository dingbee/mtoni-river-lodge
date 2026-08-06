/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary, matching existing ops services. */
/**
 * Online Check-In — staff arrivals dashboard server logic.
 * Reads only through the existing reservation / room-state / check-in tables
 * (RLS applies as the signed-in staff member). No new occupancy or
 * availability maths: room readiness comes from `room_states`, eligibility
 * from the shared `checkin_eligibility` RPC.
 */
import {
  ARRIVAL_MANAGER_ROLES,
  ARRIVAL_ROLES,
  type ArrivalAlert,
  type ArrivalListItem,
  type ArrivalReadiness,
  type ArrivalsFilter,
  type ArrivalsSummary,
  type CheckInStatusFilter,
  type DocumentAggregateStatus,
  type ReviewAction,
} from "./arrivals-shared";

type Sb = any;

const DAY = 86_400_000;

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return iso(new Date());
}

export async function assertArrivalsAccess(supabase: Sb, userId: string) {
  const { data, error } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: ARRIVAL_ROLES as unknown as string[],
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — arrivals access requires reception or manager role.");
}

export async function isManager(supabase: Sb, userId: string): Promise<boolean> {
  const { data } = await supabase.rpc("has_any_role", {
    _user_id: userId,
    _roles: ARRIVAL_MANAGER_ROLES as unknown as string[],
  });
  return Boolean(data);
}

export async function logStaffEvent(
  supabase: Sb,
  userId: string,
  claims: any,
  event: {
    action: string;
    entityId: string;
    entityLabel?: string | null;
    meta?: Record<string, unknown>;
    severity?: "info" | "warn" | "error" | "audit";
  },
) {
  try {
    await supabase.from("activity_logs").insert({
      actor_id: userId,
      actor_email: claims?.email ?? null,
      action: event.action,
      entity_type: "booking",
      entity_id: event.entityId,
      entity_label: event.entityLabel ?? null,
      metadata: { ...(event.meta ?? {}), event_type: event.action, module: "online-checkin" },
      module: "operations",
      severity: event.severity ?? "audit",
    });
  } catch (err) {
    console.warn("[arrivals] activity log failed", err);
  }
}

function resolveRange(filters: ArrivalsFilter): { from: string; to: string } {
  const now = new Date();
  switch (filters.scope) {
    case "upcoming":
      return {
        from: iso(new Date(now.getTime() + DAY)),
        to: iso(new Date(now.getTime() + 30 * DAY)),
      };
    case "week":
      return { from: iso(now), to: iso(new Date(now.getTime() + 7 * DAY)) };
    case "range":
      return { from: filters.from ?? iso(now), to: filters.to ?? filters.from ?? iso(now) };
    case "today":
    default:
      return { from: iso(now), to: iso(now) };
  }
}

function aggregateDocs(docs: any[]): {
  status: DocumentAggregateStatus;
  counts: { total: number; verified: number; pending: number; rejected: number };
} {
  const counts = {
    total: docs.length,
    verified: docs.filter((d) => d.status === "verified").length,
    pending: docs.filter((d) => d.status === "pending").length,
    rejected: docs.filter((d) => d.status === "rejected").length,
  };
  let status: DocumentAggregateStatus = "none";
  if (counts.rejected > 0) status = "rejected";
  else if (counts.total === 0) status = "none";
  else if (counts.pending > 0) status = "pending";
  else if (counts.verified === counts.total) status = "verified";
  else status = "pending";
  return { status, counts };
}

/**
 * Arrival readiness + outstanding actions, derived from the same reservation,
 * document and room-state data already loaded for the dashboard.
 */
export function deriveReadiness(input: {
  checkinStatus: CheckInStatusFilter;
  documentStatus: DocumentAggregateStatus;
  roomReadiness: string;
  reservationStatus: string;
  transferRequired?: boolean | null;
  specialRequests?: string | null;
  alerts: ArrivalAlert[];
}): { readiness: ArrivalReadiness; outstandingActions: string[] } {
  const actions: string[] = [];
  if (input.reservationStatus === "pending") actions.push("Confirm reservation");
  if (!["approved", "submitted", "under_review"].includes(input.checkinStatus))
    actions.push("Online check-in not completed");
  if (input.documentStatus === "none") actions.push("Collect identity documents");
  if (input.documentStatus === "pending") actions.push("Verify uploaded documents");
  if (input.documentStatus === "rejected") actions.push("Request replacement documents");
  if (!["vacant_clean", "occupied"].includes(input.roomReadiness)) actions.push("Prepare room");
  if (input.transferRequired) actions.push("Confirm airport transfer");
  if (input.specialRequests) actions.push("Review special request");

  const hasDanger = input.alerts.some((a) => a.severity === "danger");
  const arrived = input.reservationStatus === "checked_in";
  let readiness: ArrivalReadiness;
  if (arrived || (actions.length === 0 && !hasDanger)) readiness = "ready";
  else if (hasDanger || input.documentStatus === "rejected" || input.reservationStatus === "pending")
    readiness = "attention";
  else readiness = "pending";
  return { readiness, outstandingActions: actions };
}

export async function listArrivals(supabase: Sb, userId: string, filters: ArrivalsFilter) {
  await assertArrivalsAccess(supabase, userId);
  const { from, to } = resolveRange(filters);
  const today = todayIso();

  let q = supabase
    .from("bookings")
    .select(
      "id, reference, guest_name, guest_email, guest_type, check_in, check_out, nights, room_id, status, payment_status, special_requests, notes",
    )
    .gte("check_in", from)
    .lte("check_in", to)
    .order("check_in")
    .order("guest_name");

  if (filters.reservationStatus) q = q.eq("status", filters.reservationStatus);
  else q = q.in("status", ["pending", "confirmed", "checked_in"]);
  if (filters.roomId) q = q.eq("room_id", filters.roomId);
  if (filters.search) {
    const s = filters.search.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`guest_name.ilike.%${s}%,reference.ilike.%${s}%,guest_email.ilike.%${s}%`);
  }

  const { data: bookings, error } = await q.limit(300);
  if (error) throw new Error(error.message);
  const rows = (bookings ?? []) as any[];
  const ids = rows.map((b) => b.id);

  if (ids.length === 0) {
    return {
      arrivals: [] as ArrivalListItem[],
      summary: emptySummary(),
      rooms: await listRooms(supabase),
    };
  }

  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [checkinsRes, arrivalInfoRes, docsRes, roomStatesRes, roomsRes, activityRes] =
    await Promise.all([
      supabase
        .from("guest_checkins")
        .select(
          "id, booking_id, status, submitted_at, reviewed_at, last_activity_at, updated_at, room_state_id",
        )
        .in("booking_id", ids),
      supabase
        .from("arrival_information")
        .select(
          "booking_id, estimated_arrival_time, arrival_date, special_requests, dietary_requirements, transfer_required",
        )
        .in("booking_id", ids),
      supabase.from("guest_documents").select("id, booking_id, status, kind").in("booking_id", ids),
      supabase.from("room_states").select("id, room_id, unit_label, state, booking_id"),
      listRooms(supabase),
      supabase
        .from("guest_checkin_activity")
        .select("booking_id, action, created_at")
        .in("booking_id", ids)
        .gte("created_at", since),
    ]);

  const checkins = new Map<string, any>();
  for (const c of checkinsRes.data ?? []) checkins.set(c.booking_id, c);
  const arrivalInfo = new Map<string, any>();
  for (const a of arrivalInfoRes.data ?? []) arrivalInfo.set(a.booking_id, a);
  const docsByBooking = new Map<string, any[]>();
  for (const d of docsRes.data ?? []) {
    const list = docsByBooking.get(d.booking_id) ?? [];
    list.push(d);
    docsByBooking.set(d.booking_id, list);
  }
  const roomStates = (roomStatesRes.data ?? []) as any[];
  const rooms = roomsRes as any[];
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const activity = (activityRes.data ?? []) as any[];

  const items: ArrivalListItem[] = rows.map((b) => {
    const checkin = checkins.get(b.id);
    const info = arrivalInfo.get(b.id);
    const docs = docsByBooking.get(b.id) ?? [];
    const { status: documentStatus, counts } = aggregateDocs(docs);

    const assigned = roomStates.find((rs) => rs.booking_id === b.id);
    const pool = roomStates.filter((rs) => rs.room_id === b.room_id);
    const readyUnit = pool.find((rs) => rs.state === "vacant_clean");
    const roomReadiness = assigned
      ? assigned.state
      : (readyUnit?.state ?? (pool.length ? "not_ready" : "unassigned"));

    const checkinStatus: CheckInStatusFilter = (checkin?.status ??
      "no_link") as CheckInStatusFilter;
    const bookingActivity = activity.filter((a) => a.booking_id === b.id);
    const conflictCount = bookingActivity.filter((a) => a.action === "session_conflict").length;
    const failedVerify = bookingActivity.filter((a) => a.action.includes("verify_failed")).length;

    const alerts: ArrivalAlert[] = [];
    if (["submitted", "under_review", "approved"].includes(checkinStatus) && counts.total === 0)
      alerts.push({
        kind: "missing_documents",
        message: "Check-in submitted without identity documents.",
        severity: "danger",
      });
    else if (counts.total === 0 && b.check_in <= today)
      alerts.push({
        kind: "missing_documents",
        message: "No identity documents uploaded.",
        severity: "warn",
      });
    if (counts.rejected > 0)
      alerts.push({
        kind: "document_rejected",
        message: `${counts.rejected} document(s) rejected — guest must re-upload.`,
        severity: "warn",
      });
    if (b.check_in === today && !["occupied", "vacant_clean"].includes(roomReadiness))
      alerts.push({
        kind: "room_not_ready",
        message: `No ready unit for ${roomName.get(b.room_id) ?? "this room"}.`,
        severity: "warn",
      });
    if (b.status === "pending")
      alerts.push({
        kind: "reservation_conflict",
        message: "Reservation is not confirmed — online check-in is blocked.",
        severity: "danger",
      });
    if (b.check_in < today && b.status !== "checked_in")
      alerts.push({
        kind: "late_arrival",
        message: "Arrival date has passed without check-in.",
        severity: "danger",
      });
    if (conflictCount >= 3)
      alerts.push({
        kind: "duplicate_attempt",
        message: `${conflictCount} concurrent session attempts.`,
        severity: "info",
      });
    if (failedVerify > 0)
      alerts.push({
        kind: "failed_verification",
        message: `${failedVerify} failed verification attempt(s).`,
        severity: "warn",
      });

    const { readiness, outstandingActions } = deriveReadiness({
      checkinStatus,
      documentStatus,
      roomReadiness,
      reservationStatus: b.status,
      transferRequired: info?.transfer_required ?? null,
      specialRequests: info?.special_requests ?? b.special_requests ?? null,
      alerts,
    });

    return {
      bookingId: b.id,
      reference: b.reference,
      guestName: b.guest_name,
      guestEmail: b.guest_email,
      guestType: b.guest_type,
      checkIn: b.check_in,
      checkOut: b.check_out,
      nights: b.nights,
      roomId: b.room_id,
      roomName: roomName.get(b.room_id) ?? "—",
      unitLabel: assigned?.unit_label ?? null,
      reservationStatus: b.status,
      paymentStatus: b.payment_status,
      checkinStatus,
      documentStatus,
      documentCounts: counts,
      roomReadiness,
      specialRequests: info?.special_requests ?? b.special_requests ?? null,
      estimatedArrivalTime: info?.estimated_arrival_time ?? null,
      lastActivityAt: checkin?.last_activity_at ?? checkin?.updated_at ?? null,
      alerts,
      readiness,
      outstandingActions,
    };
  });

  const filtered = items.filter((i) => {
    if (filters.checkinStatus && i.checkinStatus !== filters.checkinStatus) return false;
    if (filters.documentStatus && i.documentStatus !== filters.documentStatus) return false;
    return true;
  });

  const summary: ArrivalsSummary = {
    todayArrivals: items.filter((i) => i.checkIn === today).length,
    upcoming: items.filter((i) => i.checkIn > today).length,
    completedCheckIns: items.filter(
      (i) => i.checkinStatus === "approved" || i.reservationStatus === "checked_in",
    ).length,
    pendingCheckIns: items.filter((i) =>
      ["no_link", "not_started", "in_progress"].includes(i.checkinStatus),
    ).length,
    missingDocuments: items.filter((i) => i.documentStatus === "none").length,
    needsReview: items.filter((i) => ["submitted", "under_review"].includes(i.checkinStatus))
      .length,
    conflicts: items.filter((i) => i.alerts.some((a) => a.severity === "danger")).length,
    vip: items.filter((i) => i.guestType === "vip" || Boolean(i.specialRequests)).length,
    ready: items.filter((i) => i.readiness === "ready").length,
    needsAttention: items.filter((i) => i.readiness === "attention").length,
  };

  return { arrivals: filtered, summary, rooms };
}

function emptySummary(): ArrivalsSummary {
  return {
    todayArrivals: 0,
    upcoming: 0,
    completedCheckIns: 0,
    pendingCheckIns: 0,
    missingDocuments: 0,
    needsReview: 0,
    conflicts: 0,
    vip: 0,
    ready: 0,
    needsAttention: 0,
  };
}

async function listRooms(supabase: Sb) {
  const { data } = await supabase.from("rooms").select("id, name, slug").order("sort_order");
  return (data ?? []) as any[];
}

export async function getArrivalDetail(supabase: Sb, userId: string, bookingId: string) {
  await assertArrivalsAccess(supabase, userId);

  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, reference, guest_name, guest_email, guest_phone, guest_id, guest_type, country, adults, children, check_in, check_out, nights, status, payment_status, balance_amount, currency, total, room_id, special_requests, notes, checked_in_at",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking) return null;

  const [checkinRes, arrivalRes, docsRes, roomRes, roomStatesRes, eligibilityRes, activityRes] =
    await Promise.all([
      supabase
        .from("guest_checkins")
        .select(
          "id, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, signature_name, terms_accepted_at, last_activity_at, expires_at, locked_at, room_state_id, draft, metadata",
        )
        .eq("booking_id", bookingId)
        .maybeSingle(),
      supabase.from("arrival_information").select("*").eq("booking_id", bookingId).maybeSingle(),
      supabase
        .from("guest_documents")
        .select(
          "id, kind, file_name, file_size, mime_type, status, rejection_reason, document_number, document_expiry, created_at, verified_at, verified_by",
        )
        .eq("booking_id", bookingId)
        .order("created_at"),
      supabase.from("rooms").select("id, name, slug").eq("id", booking.room_id).maybeSingle(),
      supabase
        .from("room_states")
        .select("id, unit_label, state, booking_id, room_id")
        .eq("room_id", booking.room_id)
        .order("unit_label"),
      supabase.rpc("checkin_eligibility", { _booking_id: bookingId }),
      supabase
        .from("guest_checkin_activity")
        .select("id, action, created_at, detail")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(40),
    ]);

  const preferences = booking.guest_id
    ? (
        await supabase
          .from("guest_preferences")
          .select("*")
          .eq("guest_id", booking.guest_id)
          .maybeSingle()
      ).data
    : null;
  const notes = booking.guest_id
    ? (
        await supabase
          .from("guest_notes")
          .select("id, body, created_at, author_id")
          .eq("guest_id", booking.guest_id)
          .eq("is_deleted", false)
          .order("created_at", { ascending: false })
          .limit(20)
      ).data
    : [];

  const roomStates = (roomStatesRes.data ?? []) as any[];
  const assigned = roomStates.find((rs) => rs.booking_id === bookingId) ?? null;

  return {
    booking,
    room: roomRes.data ?? null,
    checkin: checkinRes.data ?? null,
    arrival: arrivalRes.data ?? null,
    documents: docsRes.data ?? [],
    roomStates,
    assignedUnit: assigned,
    eligibility: eligibilityRes.data ?? null,
    activity: activityRes.data ?? [],
    preferences: preferences ?? null,
    notes: notes ?? [],
    canOverride: await isManager(supabase, userId),
  };
}

const REVIEW_TARGET: Record<ReviewAction, string> = {
  approve: "approved",
  reject: "rejected",
  request_corrections: "in_progress",
  reopen: "under_review",
};

export async function reviewCheckIn(
  supabase: Sb,
  userId: string,
  claims: any,
  input: { bookingId: string; action: ReviewAction; reason?: string },
) {
  await assertArrivalsAccess(supabase, userId);

  const { data: checkin, error } = await supabase
    .from("guest_checkins")
    .select("id, status, booking_id")
    .eq("booking_id", input.bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!checkin) throw new Error("This reservation has no online check-in submission yet.");

  if (input.action === "reject" && !input.reason?.trim())
    throw new Error("A reason is required when rejecting a check-in.");
  if (input.action === "reopen" && !(await isManager(supabase, userId)))
    throw new Error("Only a manager can reopen a reviewed check-in.");

  const next = REVIEW_TARGET[input.action];
  const patch: Record<string, unknown> = {
    status: next,
    reviewed_at: new Date().toISOString(),
    reviewed_by: userId,
    rejection_reason: input.action === "approve" ? null : (input.reason?.trim() ?? null),
  };
  if (input.action === "request_corrections") patch["locked_at"] = null;

  const { error: upErr } = await supabase.from("guest_checkins").update(patch).eq("id", checkin.id);
  if (upErr) throw new Error(upErr.message);

  const { data: booking } = await supabase
    .from("bookings")
    .select("reference, guest_name, guest_id")
    .eq("id", input.bookingId)
    .maybeSingle();

  await logStaffEvent(supabase, userId, claims, {
    action: `checkin.${input.action}`,
    entityId: input.bookingId,
    entityLabel: booking?.reference ?? null,
    meta: {
      previous_status: checkin.status,
      new_status: next,
      reason: input.reason ?? null,
      guest_id: booking?.guest_id ?? null,
      guest_name: booking?.guest_name ?? null,
      checkin_id: checkin.id,
    },
  });

  return { status: next, previousStatus: checkin.status };
}

export async function addStaffNote(
  supabase: Sb,
  userId: string,
  claims: any,
  input: { bookingId: string; body: string },
) {
  await assertArrivalsAccess(supabase, userId);
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, reference, guest_id, guest_name")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!booking?.guest_id) throw new Error("This reservation has no linked guest profile yet.");

  const { error: insErr } = await supabase
    .from("guest_notes")
    .insert({ guest_id: booking.guest_id, body: input.body, author_id: userId });
  if (insErr) throw new Error(insErr.message);

  await logStaffEvent(supabase, userId, claims, {
    action: "checkin.note_added",
    entityId: booking.id,
    entityLabel: booking.reference,
    meta: { guest_id: booking.guest_id, guest_name: booking.guest_name },
    severity: "info",
  });
  return { ok: true };
}
