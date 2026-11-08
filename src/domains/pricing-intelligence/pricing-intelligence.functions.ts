import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { z } from "zod";

const VERSION = "spe08-weekday-baseline-v1";
type AnyRow = Record<string, any>;
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rangeSchema = z.object({ from: dateSchema, to: dateSchema }).refine((v) => v.to >= v.from);
const horizonSchema = z.object({ horizonDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]) });

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(date: string, days: number) { const d = new Date(date + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
function dayDiff(from: string, to: string) { return Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000); }
function weekday(date: string) { return new Date(date + "T00:00:00Z").getUTCDay(); }
function localDateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return String(values.year) + "-" + String(values.month).padStart(2, "0") + "-" + String(values.day).padStart(2, "0");
}
function finite(n: unknown) { const v = Number(n); return Number.isFinite(v) ? v : 0; }
function isLive(status: string) { return ["confirmed", "checked_in", "completed"].includes(status); }
function isHistoricalActual(status: string) { return ["checked_in", "completed"].includes(status); }

async function propertyContext(supabase: any, userId: string) {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("Select an active property before using Pricing Intelligence.");
  const { data: allowed, error: accessError } = await supabase.rpc("staynas_user_has_property_access", {
    _uid: userId, _property_id: propertyId,
  });
  if (accessError || !allowed) throw new Error("Pricing Intelligence property access denied.");
  return String(propertyId);
}

async function loadPropertyData(supabase: any, propertyId: string, from: string, to: string) {
  const [roomResult, bookingResult] = await Promise.all([
    supabase.from("rooms").select("id,name,total_units,currency,catalogue_type_id,status")
      .eq("property_id", propertyId).eq("status", "active").limit(500),
    supabase.from("bookings")
      .select("id,property_id,room_id,check_in,check_out,nights,total,subtotal,extras_total,taxes,currency,status,source,created_at,pricing_snapshot")
      .eq("property_id", propertyId).gte("check_out", from).lte("check_in", to)
      .order("check_in", { ascending: true }).limit(5000),
  ]);
  if (roomResult.error) throw new Error("Unable to load property room inventory.");
  if (bookingResult.error) throw new Error("Unable to load property reservation history.");
  const bookings = (bookingResult.data ?? []) as AnyRow[];
  const ids = bookings.map((b) => b.id);
  let nights: AnyRow[] = [];
  if (ids.length) {
    const nightResult = await supabase.from("booking_nights")
      .select("id,booking_id,room_id,date,nightly_rate,pricing_snapshot")
      .in("booking_id", ids).gte("date", from).lte("date", to).order("date").limit(20000);
    if (nightResult.error) throw new Error("Unable to load booking-night pricing evidence.");
    nights = (nightResult.data ?? []) as AnyRow[];
  }
  const byId = new Map(bookings.map((b) => [String(b.id), b]));
  return { rooms: (roomResult.data ?? []) as AnyRow[], bookings, nights, bookingById: byId };
}

export const getPricingIntelligenceDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => rangeSchema.parse(v))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: propertyMeta, error: propertyMetaError } = await context.supabase.from("staynas_properties").select("timezone").eq("id", propertyId).maybeSingle();
    if (propertyMetaError || !propertyMeta?.timezone) throw new Error("Property timezone is not configured.");
    const propertyTimezone = String(propertyMeta.timezone);
    const { rooms, bookings, nights, bookingById } = await loadPropertyData(context.supabase, propertyId, data.from, data.to);
    const bookingDateResult = await context.supabase.from("bookings")
      .select("id,created_at,status").eq("property_id", propertyId)
      .gte("created_at", addDays(data.from, -1) + "T00:00:00.000Z")
      .lte("created_at", addDays(data.to, 1) + "T23:59:59.999Z").limit(5000);
    if (bookingDateResult.error) throw new Error("Unable to load booking-date analytics.");
    const bookingDateRows = (bookingDateResult.data ?? []) as AnyRow[];
    const stayBookings = bookings.filter((b) => String(b.check_in) >= data.from && String(b.check_in) <= data.to);

    const days = Math.max(1, dayDiff(data.from, data.to) + 1);
    const units = rooms.reduce((n, r) => n + Math.max(0, finite(r.total_units)), 0);
    const currencyBuckets = new Map<string, AnyRow>();
    const byStayDate = new Map<string, AnyRow>();
    const byChannel = new Map<string, AnyRow>();
    const byRoom = new Map<string, AnyRow>();
    let bookedRoomNights = 0, completedRoomNights = 0, bookedAccommodation = 0, completedAccommodation = 0;
    let missingNightRates = 0, invalidCurrencies = 0, unattributed = 0, cancelled = 0, noShows = 0;
    for (const b of stayBookings) {
      if (b.status === "cancelled") cancelled++;
      if (b.status === "no_show") noShows++;
      if (b.status === "confirmed" || b.status === "checked_in" || b.status === "completed") {
        const c = String(b.currency ?? "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(c)) invalidCurrencies++;
        if (!b.source) unattributed++;
        const bucket = currencyBuckets.get(c) ?? { currency: c || "INVALID", bookingValue: 0, bookedAccommodation: 0, completedAccommodation: 0, bookedRoomNights: 0, completedRoomNights: 0, bookingCount: 0 };
        bucket.bookingValue += finite(b.total);
        bucket.bookingCount++;
        currencyBuckets.set(c, bucket);
      }
    }
    for (const n of nights) {
      const b = bookingById.get(String(n.booking_id));
      if (!b || !isLive(String(b.status))) continue;
      const currency = String(b.currency ?? "").toUpperCase();
      const amount = finite(n.nightly_rate);
      if (n.nightly_rate === null || n.nightly_rate === undefined || !Number.isFinite(Number(n.nightly_rate))) missingNightRates++;
      const bucket = currencyBuckets.get(currency) ?? { currency: currency || "INVALID", bookingValue: 0, bookedAccommodation: 0, completedAccommodation: 0, bookedRoomNights: 0, completedRoomNights: 0, bookingCount: 0 };
      bucket.bookedAccommodation += amount;
      bucket.bookedRoomNights++;
      bookedAccommodation += amount; bookedRoomNights++;
      if (b.status === "completed") {
        bucket.completedAccommodation += amount; bucket.completedRoomNights++;
        completedAccommodation += amount; completedRoomNights++;
      }
      currencyBuckets.set(currency, bucket);
      const day = String(n.date);
      const dayRow = byStayDate.get(day) ?? { date: day, bookedRoomNights: 0, accommodationByCurrency: {} as Record<string, number> };
      dayRow.bookedRoomNights++;
      dayRow.accommodationByCurrency[currency || "INVALID"] = finite(dayRow.accommodationByCurrency[currency || "INVALID"]) + amount;
      byStayDate.set(day, dayRow);
      const source = String(b.source ?? "unattributed");
      const ch = byChannel.get(source) ?? { source, bookings: 0, roomNights: 0, accommodationByCurrency: {} as Record<string, number> };
      ch.roomNights++; ch.accommodationByCurrency[currency || "INVALID"] = finite(ch.accommodationByCurrency[currency || "INVALID"]) + amount;
      byChannel.set(source, ch);
      const roomId = String(n.room_id ?? b.room_id);
      const room = byRoom.get(roomId) ?? { roomId, roomName: rooms.find((r) => String(r.id) === roomId)?.name ?? "Unmapped room", roomNights: 0, accommodationByCurrency: {} as Record<string, number> };
      room.roomNights++; room.accommodationByCurrency[currency || "INVALID"] = finite(room.accommodationByCurrency[currency || "INVALID"]) + amount;
      byRoom.set(roomId, room);
    }
    for (const b of stayBookings) {
      if (!isLive(String(b.status))) continue;
      const channel = String(b.source ?? "unattributed");
      const ch = byChannel.get(channel);
      if (ch) ch.bookings++;
    }
    const currencyBreakdown = [...currencyBuckets.values()].map((b) => {
      const capacity = units * days;
      return {
        ...b,
        adr: b.bookedRoomNights ? b.bookedAccommodation / b.bookedRoomNights : null,
        revpar: capacity ? b.bookedAccommodation / capacity : null,
        bookedOccupancy: capacity ? Math.min(1, b.bookedRoomNights / capacity) : null,
      };
    });
    const bookingDates = new Map<string, number>();
    for (const b of bookingDateRows) {
      const d = b.created_at ? localDateInZone(new Date(String(b.created_at)), propertyTimezone) : "";
      if (d >= data.from && d <= data.to) bookingDates.set(d, (bookingDates.get(d) ?? 0) + 1);
    }
    const reservationCount = stayBookings.length;
    const cancellationRate = reservationCount ? cancelled / reservationCount : null;
    const noShowRate = reservationCount ? noShows / reservationCount : null;
    const leadDays = stayBookings.filter((b) => isLive(String(b.status))).map((b) =>
      Math.max(0, (Date.parse(String(b.check_in) + "T00:00:00Z") - Date.parse(localDateInZone(new Date(String(b.created_at)), propertyTimezone) + "T00:00:00Z")) / 86400000)
    );
    const coverage = {
      roomCount: rooms.length, totalUnits: units, reservationRows: bookings.length,
      bookingNightRows: nights.length, missingNightRates, invalidCurrencies, unattributedChannelRows: unattributed,
      historicalSnapshotsAvailable: bookings.filter((b) => b.pricing_snapshot && Object.keys(b.pricing_snapshot).length > 0).length,
      financialClassification: "Booking-night nightly_rate is treated as accommodation-only booked value; booking total is booking value and is not recognized revenue.",
    };
    const limitations = [
      "Booked occupancy is not actual occupied inventory. Only checked-in/completed status is separately identifiable; physical room occupancy is not independently verified.",
      "Recognized revenue is not reported because an accounting recognition policy is not configured.",
      "Tax, fee, discount, promotion and channel commission attribution is not inferred from booking totals.",
      "Currencies are kept separate; no exchange-rate conversion is configured.",
      ...(missingNightRates ? ["Some booking-night rates are missing."] : []),
      ...(invalidCurrencies ? ["Some reservations have invalid or missing currency codes."] : []),
      ...(unattributed ? ["Some bookings have no channel attribution."] : []),
    ];
    return {
      propertyId, period: { from: data.from, to: data.to }, generatedAt: new Date().toISOString(),
      metrics: {
        bookingValueByCurrency: currencyBreakdown.map((b) => ({ currency: b.currency, bookingValue: b.bookingValue })),
        accommodationByCurrency: currencyBreakdown,
        bookedRoomNights, completedRoomNights,
        bookedAdrByCurrency: currencyBreakdown.map((b) => ({ currency: b.currency, adr: b.adr })),
        bookedRevparByCurrency: currencyBreakdown.map((b) => ({ currency: b.currency, revpar: b.revpar })),
        bookedOccupancy: units * days ? Math.min(1, bookedRoomNights / (units * days)) : null,
        averageLengthOfStay: stayBookings.filter((b) => isLive(String(b.status))).length
          ? stayBookings.filter((b) => isLive(String(b.status))).reduce((n, b) => n + finite(b.nights), 0) / stayBookings.filter((b) => isLive(String(b.status))).length : null,
        averageBookingLeadDays: leadDays.length ? leadDays.reduce((n, v) => n + v, 0) / leadDays.length : null,
        cancellationRate, noShowRate, cancellationCount: cancelled, noShowCount: noShows,
        byStayDate: [...byStayDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        byBookingDate: [...bookingDates.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count })),
        byChannel: [...byChannel.values()], byRoom: [...byRoom.values()],
      },
      dataQuality: coverage, limitations,
    };
  });

export const getPricingDemandForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => horizonSchema.parse(v))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: propertyMeta, error: propertyMetaError } = await context.supabase.from("staynas_properties").select("timezone").eq("id", propertyId).maybeSingle();
    if (propertyMetaError || !propertyMeta?.timezone) throw new Error("Property timezone is not configured.");
    const today = localDateInZone(new Date(), String(propertyMeta.timezone));
    const to = addDays(today, data.horizonDays - 1);
    const historyFrom = addDays(today, -365);
    const { rooms, bookings, nights, bookingById } = await loadPropertyData(context.supabase, propertyId, historyFrom, to);
    const units = rooms.reduce((n, r) => n + Math.max(0, finite(r.total_units)), 0);
    const historicalByDay = new Map<string, number>();
    const forwardByDay = new Map<string, number>();
    for (const n of nights) {
      const b = bookingById.get(String(n.booking_id));
      if (!b) continue;
      const d = String(n.date);
      if (d < today && isHistoricalActual(String(b.status))) historicalByDay.set(d, (historicalByDay.get(d) ?? 0) + 1);
      if (d >= today && ["confirmed", "checked_in"].includes(String(b.status))) forwardByDay.set(d, (forwardByDay.get(d) ?? 0) + 1);
    }
    const historyDays = [...historicalByDay.keys()].length;
    const weekdays = Array.from({ length: 7 }, (_, w) => {
      const values = [...historicalByDay.entries()].filter(([d]) => weekday(d) === w).map(([, v]) => v / Math.max(1, units));
      return { weekday: w, observations: values.length, meanOccupancy: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null };
    });
    const sufficient = units > 0 && historyDays >= 28 && weekdays.filter((w) => w.observations >= 3).length >= 5;
    const daily = Array.from({ length: data.horizonDays }, (_, i) => {
      const date = addDays(today, i);
      const bookedUnits = forwardByDay.get(date) ?? 0;
      const hist = weekdays[weekday(date)];
      const bookedOccupancy = units ? Math.min(1, bookedUnits / units) : null;
      const baseline = sufficient && hist.meanOccupancy !== null ? hist.meanOccupancy : null;
      const expectedOccupancy = baseline === null ? null : Math.max(bookedOccupancy ?? 0, baseline);
      const uncertainty = hist.observations ? Math.min(0.5, 1 / Math.sqrt(hist.observations)) : null;
      return { date, bookedUnits, bookedOccupancy, expectedOccupancy, uncertainty, historicalWeekdayObservations: hist.observations };
    });
    const valid = daily.filter((d) => d.expectedOccupancy !== null);
    const forecast = {
      status: sufficient ? "available" : "insufficient_data",
      generatedAt: new Date().toISOString(), horizonDays: data.horizonDays,
      methodVersion: VERSION, method: "Historical completed/checked-in occupancy by weekday; expected occupancy is the greater of confirmed forward bookings and weekday baseline.",
      dataCoverage: { historicalDays: historyDays, historicalBookingNights: [...historicalByDay.values()].reduce((a, b) => a + b, 0), roomUnits: units, weekdayCoverage: weekdays },
      expectedOccupancy: valid.length ? valid.reduce((n, d) => n + finite(d.expectedOccupancy), 0) / valid.length : null,
      daily, confidence: sufficient ? Math.min(0.75, 0.35 + Math.min(0.4, historyDays / 365 * 0.4)) : null,
      uncertainty: "Per-date uncertainty is a transparent sample-size proxy, not measured forecast accuracy.",
      limitations: [
        "No holdout backtest has been run; no forecast accuracy claim is made.",
        "Forecast is an occupancy baseline, not a financial revenue forecast.",
        "Historical actual proxy uses checked_in/completed reservation status and may not represent physical room occupancy.",
        "Seasonality beyond weekday effects is not modelled.",
        "Pending reservations are excluded from committed demand.",
        ...(!sufficient ? ["At least 28 distinct historical stay dates, 5 weekdays with 3+ observations each, and configured room units are required."] : []),
      ],
    };
    const save = await context.supabase.from("staynas_pricing_forecasts").insert({
      property_id: propertyId, horizon_days: data.horizonDays, from_date: today, to_date: to,
      method_version: VERSION, data_coverage: forecast.dataCoverage, forecast,
      confidence: forecast.confidence, uncertainty: { type: "sample_size_proxy" },
      limitations: forecast.limitations, generated_by: context.userId,
    }).select("id").single();
    if (save.error) throw new Error("Forecast was calculated but could not be saved to its audit history.");
    return { ...forecast, forecastId: save.data.id };
  });

export const generatePricingReviewRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ horizonDays: horizonSchema.shape.horizonDays }).parse(v))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const forecast = await getPricingDemandForecast({ data: { horizonDays: data.horizonDays } } as never);
    if (forecast.status !== "available") return { generated: 0, status: "insufficient_data" as const };
    const highDemand = forecast.daily.filter((d: AnyRow) => d.expectedOccupancy !== null && d.expectedOccupancy >= 0.85 && d.expectedOccupancy - (d.bookedOccupancy ?? 0) >= 0.1);
    if (!highDemand.length) return { generated: 0, status: "no_supported_opportunity" as const };
    const from = highDemand[0].date, to = highDemand[highDemand.length - 1].date;
    const { data: rooms, error } = await context.supabase.from("rooms")
      .select("id,name,currency,total_units").eq("property_id", propertyId).eq("status", "active").limit(100);
    if (error) throw new Error("Unable to inspect room inventory for recommendations.");
    let generated = 0;
    for (const room of [{ id: null, name: "Property-wide", currency: null, total_units: null }]) {
      const evidence = highDemand.map((d: AnyRow) => ({ date: d.date, expectedOccupancy: d.expectedOccupancy, bookedOccupancy: d.bookedOccupancy, historicalWeekdayObservations: d.historicalWeekdayObservations }));
      const inserted = await context.supabase.from("staynas_pricing_recommendations").insert({
        property_id: propertyId, room_id: null, recommendation_type: "rate_review",
        window_from: from, window_to: to, currency: null,
        current_context: { scope: "property", basis: "published room-type and rate-plan pricing must be reviewed in canonical rate-plan workspace" },
        proposed_action: { action: "Review the published rate for these high-demand dates.", suggestedRate: null, automaticExecution: false },
        expected_impact: { amount: null, note: "Not estimated; no validated price-elasticity or conversion model is configured." },
        evidence, explanation: {
          observation: "Weekday-baseline expected occupancy is at least 85% and exceeds confirmed forward occupancy by at least 10 percentage points.",
          rationale: "Review rate positioning while preserving the existing rate publication workflow.",
          nextStep: "Open the canonical rate-plan calendar and independently decide whether to create a versioned rate change.",
          risks: "Historical weekday baseline is not a demand guarantee; capacity and status quality constrain this inference.",
        },
        confidence: Math.min(0.75, finite(forecast.confidence)), method_version: VERSION,
        limitations: forecast.limitations, status: "pending_review", expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        created_by: context.userId,
      }).select("id").single();
      if (!inserted.error) {
        generated++;
        await context.supabase.from("staynas_pricing_recommendation_events").insert({
          property_id: propertyId, recommendation_id: inserted.data.id, event_type: "generated",
          actor_id: context.userId, evidence: { forecastId: forecast.forecastId },
        });
      }
    }
    return { generated, status: "complete" as const, reviewWindow: { from, to } };
  });

export const decidePricingRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    id: z.string().uuid(), decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().min(5).max(500),
  }).parse(v))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: current, error: readError } = await context.supabase.from("staynas_pricing_recommendations")
      .select("id,status,expires_at").eq("id", data.id).eq("property_id", propertyId).maybeSingle();
    if (readError || !current) throw new Error("Recommendation not found for the active property.");
    if (current.status !== "pending_review" && current.status !== "generated") throw new Error("Recommendation is no longer reviewable.");
    if (current.expires_at && Date.parse(current.expires_at) <= Date.now()) throw new Error("Recommendation has expired.");
    const { data: updated, error } = await context.supabase.from("staynas_pricing_recommendations").update({
      status: data.decision, reviewed_by: context.userId, reviewed_at: new Date().toISOString(), decision_reason: data.reason,
    }).eq("id", data.id).eq("property_id", propertyId).in("status", ["generated", "pending_review"]).select("id").maybeSingle();
    if (error || !updated) throw new Error("Recommendation decision was not saved; property administrator approval is required.");
    const event = await context.supabase.from("staynas_pricing_recommendation_events").insert({
      property_id: propertyId, recommendation_id: data.id, event_type: data.decision,
      actor_id: context.userId, reason: data.reason,
    });
    if (event.error) throw new Error("Decision saved, but audit event persistence failed; contact an administrator.");
    return { id: data.id, status: data.decision, execution: "No rate, promotion, reservation or distribution action was executed." };
  });

export const savePricingScenario = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({
    name: z.string().trim().min(1).max(120), roomId: z.string().uuid(), ratePlanId: z.string().uuid().optional(),
    from: dateSchema, to: dateSchema, adults: z.number().int().min(1).max(20).default(1),
    adjustmentPercent: z.number().min(-50).max(50),
  }).refine((v) => v.to > v.from).parse(v))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: room, error: roomError } = await context.supabase.from("rooms")
      .select("id,slug,currency").eq("id", data.roomId).eq("property_id", propertyId).eq("status", "active").maybeSingle();
    if (roomError || !room) throw new Error("Room is not available in the active property.");
    const { data: resolved, error } = await context.supabase.rpc("resolve_staynas_published_room_pricing", {
      _property_id: propertyId, _room_id: data.roomId, _check_in: data.from, _check_out: data.to,
      _adults: data.adults, _children_below_6: 0, _children_7_plus: 0, _rate_plan_id: data.ratePlanId ?? null,
      _booking_timestamp: new Date().toISOString(),
    });
    if (error || !resolved || resolved.ok !== true) throw new Error("Canonical published pricing could not resolve this scenario. Select an eligible rate plan and retry.");
    if (resolved.mode === "legacy" || resolved.accommodation_subtotal === null || resolved.accommodation_subtotal === undefined || !Number.isFinite(Number(resolved.accommodation_subtotal))) {
      throw new Error("Scenario requires an eligible published rate plan with canonical accommodation subtotal.");
    }
    const baseline = finite(resolved.accommodation_subtotal);
    const proposed = Math.round((baseline * (1 + data.adjustmentPercent / 100) + Number.EPSILON) * 100) / 100;
    const result = {
      baselineAccommodation: baseline, proposedAccommodation: proposed,
      delta: proposed - baseline, deltaPercent: data.adjustmentPercent,
      currency: String(resolved.currency ?? room.currency).toUpperCase(),
      occupancyImpact: null, revenueImpact: null,
      ratePlanId: resolved.rate_plan_id ?? data.ratePlanId ?? null,
      publicationId: resolved.publication_id ?? null,
    };
    const limitations = [
      "Accommodation-only scenario using the canonical SPE-04 resolver as the baseline.",
      "Taxes, fees and promotions are not recalculated for the hypothetical rate; the result is not a payable quote.",
      "Demand elasticity, conversion and occupancy response are not estimated.",
      "No live rate, inventory, booking or distribution record is changed.",
    ];
    const saved = await context.supabase.from("staynas_pricing_scenarios").insert({
      property_id: propertyId, name: data.name, currency: result.currency, window_from: data.from, window_to: data.to,
      baseline: { accommodation: baseline, publicationId: result.publicationId, ratePlanId: result.ratePlanId },
      proposal: { adjustmentPercent: data.adjustmentPercent, proposedAccommodation: proposed },
      result, assumptions: ["Demand and room-night volume held constant."], limitations,
      method_version: VERSION, created_by: context.userId,
    }).select("id").single();
    if (saved.error) throw new Error("Scenario calculated but could not be persisted.");
    return { scenarioId: saved.data.id, ...result, limitations };
  });

export const listPricingRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ limit: z.number().int().min(1).max(100).default(25) }).default({ limit: 25 }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.from("staynas_pricing_recommendations")
      .select("id,room_id,recommendation_type,window_from,window_to,currency,current_context,proposed_action,expected_impact,evidence,explanation,confidence,status,generated_at,expires_at,limitations")
      .eq("property_id", propertyId).order("generated_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("Unable to load pricing recommendations.");
    return rows ?? [];
  });

export const listPricingScenarios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((v: unknown) => z.object({ limit: z.number().int().min(1).max(100).default(20) }).default({ limit: 20 }).parse(v ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const propertyId = await propertyContext(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase.from("staynas_pricing_scenarios")
      .select("id,name,currency,window_from,window_to,result,limitations,created_at")
      .eq("property_id", propertyId).order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error("Unable to load pricing scenario history.");
    return rows ?? [];
  });
