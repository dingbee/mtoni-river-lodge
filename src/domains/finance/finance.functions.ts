import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { financeRpc } from "@/lib/finance-rpc";
import { recordManualPaymentInputSchema } from "./payment-contract";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RevenueFilters = {
  from?: string; // ISO date
  to?: string;
  roomId?: string | null;
  source?: string | null;
  country?: string | null;
  paymentMethod?: string | null;
};

const filtersSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    roomId: z.string().uuid().nullable().optional(),
    source: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    paymentMethod: z.string().nullable().optional(),
  })
  .default({});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
function firstOfMonth() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}
function firstOfYear() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Module 1 — Revenue Dashboard KPIs
// ---------------------------------------------------------------------------

export const getRevenueDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const from = data.from ?? daysAgo(30);
    const to = data.to ?? todayISO();

    let q = context.supabase
      .from("bookings")
      .select(
        "id, reference, room_id, check_in, check_out, nights, adults, children, total, paid_amount, deposit_amount, balance_amount, balance_due, currency, source, country, payment_method, payment_status, status, created_at",
      )
      .gte("check_in", from)
      .lte("check_in", to);
    if (data.roomId) q = q.eq("room_id", data.roomId);
    if (data.source) q = q.eq("source", data.source);
    if (data.country) q = q.eq("country", data.country);
    if (data.paymentMethod) q = q.eq("payment_method", data.paymentMethod);
    const { data: bookings, error } = await q;
    if (error) throw error;

    const active = (bookings ?? []).filter((b) => b.status !== "cancelled");

    const [{ data: today }, { data: mtd }, { data: ytd }, { data: rooms }] =
      await Promise.all([
        context.supabase
          .from("bookings")
          .select("total, currency, status")
          .eq("check_in", todayISO()),
        context.supabase
          .from("bookings")
          .select("total, currency, status")
          .gte("check_in", firstOfMonth())
          .lte("check_in", todayISO()),
        context.supabase
          .from("bookings")
          .select("total, currency, status")
          .gte("check_in", firstOfYear())
          .lte("check_in", todayISO()),
        context.supabase.from("rooms").select("id, slug, name, total_units"),
      ]);

    const sumByCurrency = (rows: Array<{ total: number | string; currency: string; status?: string }> | null) => {
      const totals = new Map<string, number>();
      for (const row of rows ?? []) {
        if (row.status === "cancelled") continue;
        const currency = String(row.currency || "UNKNOWN").toUpperCase();
        totals.set(currency, (totals.get(currency) ?? 0) + Number(row.total ?? 0));
      }
      return totals;
    };

    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 1), 0) || 1;
    const nightsSold = active.reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const rangeDays = Math.max(1, Math.ceil((+new Date(to) - +new Date(from)) / 86_400_000) + 1);
    const availableRoomNights = totalUnits * rangeDays;
    const occupancy = availableRoomNights > 0 ? nightsSold / availableRoomNights : 0;

    const activeIds = active.map((booking) => booking.id);
    const { data: refundEvents, error: refundError } = activeIds.length
      ? await context.supabase.from("payment_events")
          .select("booking_id, amount, currency, event_type")
          .in("booking_id", activeIds)
          .in("event_type", ["refund", "refund_issued"])
      : { data: [], error: null };
    if (refundError) throw refundError;

    const bookingCurrency = new Map(active.map((booking) => [booking.id, String(booking.currency || "UNKNOWN").toUpperCase()]));
    const currencyTotals = new Map<string, { revenue: number; outstanding: number; deposits: number; refunds: number; nights: number; todayRevenue: number; mtdRevenue: number; ytdRevenue: number }>();
    const ensureCurrency = (currency: string) => {
      const key = String(currency || "UNKNOWN").toUpperCase();
      if (!currencyTotals.has(key)) currencyTotals.set(key, { revenue: 0, outstanding: 0, deposits: 0, refunds: 0, nights: 0, todayRevenue: 0, mtdRevenue: 0, ytdRevenue: 0 });
      return currencyTotals.get(key)!;
    };
    for (const booking of active) {
      const totals = ensureCurrency(booking.currency);
      totals.revenue += Number(booking.total ?? 0);
      totals.outstanding += Number(booking.balance_amount ?? 0);
      totals.deposits += Number(booking.deposit_amount ?? 0);
      totals.nights += Number(booking.nights ?? 0);
    }
    for (const event of refundEvents ?? []) {
      const currency = event.currency || bookingCurrency.get(event.booking_id) || "UNKNOWN";
      ensureCurrency(currency).refunds += Math.abs(Number(event.amount ?? 0));
    }
    const todayTotals = sumByCurrency(today);
    const mtdTotals = sumByCurrency(mtd);
    const ytdTotals = sumByCurrency(ytd);
    for (const [currency, totals] of currencyTotals) {
      totals.todayRevenue = todayTotals.get(currency) ?? 0;
      totals.mtdRevenue = mtdTotals.get(currency) ?? 0;
      totals.ytdRevenue = ytdTotals.get(currency) ?? 0;
    }

    const byRoom = new Map<string, number>();
    const bySource = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const byMonth = new Map<string, number>();
    for (const b of active) {
      const currency = String(b.currency || "UNKNOWN").toUpperCase();
      const add = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + Number(b.total ?? 0));
      add(byRoom, `${currency}|${b.room_id}`);
      add(bySource, `${currency}|${b.source ?? "unknown"}`);
      add(byCountry, `${currency}|${b.country ?? "—"}`);
      add(byMonth, `${currency}|${String(b.check_in).slice(0, 7)}`);
    }
    const roomMap = new Map((rooms ?? []).map((r) => [r.id, r]));
    const splitKey = (key: string) => key.split("|", 2);

    return {
      range: { from, to },
      currencySummaries: Array.from(currencyTotals.entries()).map(([currency, totals]) => ({
        currency, ...totals,
        adr: totals.nights > 0 ? totals.revenue / totals.nights : 0,
        revpar: availableRoomNights > 0 ? totals.revenue / availableRoomNights : 0,
      })).sort((a, b) => a.currency.localeCompare(b.currency)),
      occupancy,
      nightsSold,
      availableRoomNights,
      balanceFieldMismatches: active.filter((b) => Math.abs(Number(b.balance_amount ?? 0) - Number(b.balance_due ?? 0)) > 0.01).length,
      revenueByRoom: Array.from(byRoom.entries()).map(([key, total]) => {
        const [currency, room_id] = splitKey(key);
        return { currency, room_id, name: roomMap.get(room_id)?.name ?? "Unknown", total };
      }).sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total),
      revenueBySource: Array.from(bySource.entries()).map(([key, total]) => {
        const [currency, source] = splitKey(key);
        return { currency, source, total };
      }).sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total),
      revenueByCountry: Array.from(byCountry.entries()).map(([key, total]) => {
        const [currency, country] = splitKey(key);
        return { currency, country, total };
      }).sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total).slice(0, 20),
      revenueTrend: Array.from(byMonth.entries()).map(([key, total]) => {
        const [currency, month] = splitKey(key);
        return { currency, month, total };
      }).sort((a, b) => a.currency.localeCompare(b.currency) || a.month.localeCompare(b.month)),
    };
  });

// ---------------------------------------------------------------------------
// Revenue Health Score (traffic-light)
// ---------------------------------------------------------------------------

export const getRevenueHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const from = daysAgo(30);
    const to = daysAgo(-30);
    const [{ data: past, error: pastError }, { data: future, error: futureError }, { data: rooms, error: roomsError }] = await Promise.all([
      context.supabase.from("bookings")
        .select("total, currency, nights, status, balance_amount, check_in, payment_status")
        .gte("check_in", from).lte("check_in", todayISO()),
      context.supabase.from("bookings")
        .select("currency, status, check_in")
        .gt("check_in", todayISO()).lte("check_in", to),
      context.supabase.from("rooms").select("id, total_units"),
    ]);
    if (pastError) throw pastError;
    if (futureError) throw futureError;
    if (roomsError) throw roomsError;

    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 1), 0) || 1;
    const pastRows = past ?? [];
    const pastActive = pastRows.filter((b) => b.status !== "cancelled");
    const cancelled = pastRows.filter((b) => b.status === "cancelled").length;
    const nights = pastActive.reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const occupancy = nights / (totalUnits * 30);
    const byCurrency = new Map<string, { revenue: number; outstanding: number; bookingCount: number }>();
    for (const booking of pastActive) {
      const currency = String(booking.currency || "UNKNOWN").toUpperCase();
      const totals = byCurrency.get(currency) ?? { revenue: 0, outstanding: 0, bookingCount: 0 };
      totals.revenue += Number(booking.total ?? 0);
      totals.outstanding += Number(booking.balance_amount ?? 0);
      totals.bookingCount += 1;
      byCurrency.set(currency, totals);
    }
    const currencySignals = Array.from(byCurrency.entries()).map(([currency, totals]) => ({
      currency, ...totals,
      outstandingRate: totals.revenue > 0 ? totals.outstanding / totals.revenue : (totals.outstanding > 0 ? 1 : 0),
    }));
    const worstOutstandingRate = currencySignals.reduce((max, row) => Math.max(max, row.outstandingRate), 0);
    const forwardBookings = (future ?? []).filter((b) => b.status !== "cancelled").length;

    // Score uses currency-neutral ratios only; unlike raw amounts, ratios are comparable.
    let score = 50;
    if (occupancy >= 0.7) score += 20;
    else if (occupancy >= 0.5) score += 10;
    else if (occupancy < 0.3) score -= 15;
    if (currencySignals.length && worstOutstandingRate < 0.1) score += 15;
    else if (worstOutstandingRate > 0.3) score -= 15;
    if (forwardBookings > 0) score += 10;
    if (pastActive.length > 0 && cancelled > pastActive.length * 0.2) score -= 10;
    score = Math.max(0, Math.min(100, score));
    const status: "healthy" | "attention" | "critical" = score >= 70 ? "healthy" : score >= 45 ? "attention" : "critical";

    return {
      score, status,
      signals: {
        occupancy30d: occupancy,
        byCurrency: currencySignals,
        forwardBookings30d: forwardBookings,
        cancellations30d: cancelled,
      },
    };
  });

// ---------------------------------------------------------------------------
// Module 2 — Payment Centre
// ---------------------------------------------------------------------------

export const listPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        status: z.string().optional(),
        search: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().min(1).max(200).default(100),
      })
      .default({ limit: 100 })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    let q = context.supabase
      .from("bookings")
      .select(
        "id, reference, guest_name, guest_email, check_in, check_out, total, deposit_amount, balance_amount, paid_amount, currency, payment_status, payment_method, payment_completed_at, payment_failed_at, pesapal_order_tracking_id, status, invoice_number, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.status) q = q.eq("payment_status", data.status as never);
    if (data.search)
      q = q.or(`reference.ilike.%${data.search}%,guest_email.ilike.%${data.search}%,guest_name.ilike.%${data.search}%`);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const getPaymentTimeline = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const [bookingResult, eventsResult] = await Promise.all([
      context.supabase
        .from("bookings")
        .select(
          "id, reference, guest_name, guest_email, total, deposit_amount, balance_amount, paid_amount, currency, payment_status, payment_method, payment_completed_at, payment_failed_at, payment_initiated_at, payment_mismatch_at, pesapal_order_tracking_id, pesapal_merchant_reference",
        )
        .eq("id", data.bookingId)
        .maybeSingle(),
      context.supabase
        .from("payment_events")
        .select("*")
        .eq("booking_id", data.bookingId)
        .order("created_at", { ascending: false }),
    ]);
    if (bookingResult.error) throw new Error(`Unable to load booking payment summary: ${bookingResult.error.message}`);
    if (eventsResult.error) throw new Error(`Unable to load payment timeline: ${eventsResult.error.message}`);
    if (!bookingResult.data) throw new Error("Booking not found or property access denied");
    return { booking: bookingResult.data, events: eventsResult.data ?? [] };
  });

export const recordManualPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordManualPaymentInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { data: result, error } = await financeRpc(context.supabase).rpc(
      "record_booking_payment",
      {
        _booking_id: data.bookingId,
        _amount: data.amount,
        _event_type: data.eventType,
        _method: data.method,
        _note: data.note ?? null,
        _idempotency_key: data.idempotencyKey,
      },
    );
    if (error) throw new Error(`Payment was not recorded: ${error.message}`);
    if (!result?.ok) throw new Error("Payment transaction did not complete");
    return {
      ok: true,
      duplicate: result.duplicate,
      eventId: result.event_id,
      paidAmount: Number(result.paid_amount),
      newBalance: Number(result.balance_amount),
      newStatus: result.payment_status,
    };
  });

// ---------------------------------------------------------------------------
// Module 3 — Invoice Manager
// ---------------------------------------------------------------------------

export const listInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ status: z.enum(["all", "issued", "draft"]).default("all"), search: z.string().optional() })
      .default({ status: "all" })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    let q = context.supabase
      .from("bookings")
      .select(
        "id, reference, invoice_number, guest_name, guest_email, check_in, check_out, total, currency, payment_status, status, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status === "issued") q = q.not("invoice_number", "is", null);
    if (data.status === "draft") q = q.is("invoice_number", null);
    if (data.search) q = q.or(`reference.ilike.%${data.search}%,invoice_number.ilike.%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const finalizeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { data: b } = await context.supabase
      .from("bookings")
      .select("id, reference, invoice_number")
      .eq("id", data.bookingId)
      .maybeSingle();
    if (!b) throw new Error("Booking not found");
    if (b.invoice_number) return { ok: true, invoice_number: b.invoice_number };
    const now = new Date();
    const yy = String(now.getUTCFullYear()).slice(-2);
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const seq = Math.floor(Math.random() * 90000 + 10000);
    const invoice_number = `INV-${yy}${mm}-${seq}`;
    const { error } = await context.supabase
      .from("bookings")
      .update({ invoice_number })
      .eq("id", data.bookingId);
    if (error) throw error;
    return { ok: true, invoice_number };
  });

export const getInvoicePdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bookingId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { buildInvoiceForBooking } = await import("@/lib/booking-invoice.server");
    const inv = await buildInvoiceForBooking(data.bookingId);
    if (!inv) throw new Error("Invoice unavailable");
    // Return base64 for client-side download.
    let binary = "";
    for (let i = 0; i < inv.bytes.length; i++) binary += String.fromCharCode(inv.bytes[i]);
    return { filename: inv.filename, base64: btoa(binary) };
  });

// ---------------------------------------------------------------------------
// Module 4 — Revenue Analytics
// ---------------------------------------------------------------------------

export const getRevenueAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const from = data.from ?? firstOfYear();
    const to = data.to ?? todayISO();
    const { data: rows } = await context.supabase
      .from("bookings")
      .select(
        "id, guest_id, guest_email, room_id, total, nights, status, source, country, check_in, cancelled_at",
      )
      .gte("check_in", from)
      .lte("check_in", to);
    const active = (rows ?? []).filter((b) => b.status !== "cancelled");
    const cancelled = (rows ?? []).filter((b) => b.status === "cancelled");

    const byMonth = new Map<string, number>();
    const bySource = new Map<string, { total: number; count: number }>();
    const guestSpend = new Map<string, { total: number; stays: number }>();
    for (const b of active) {
      const m = String(b.check_in).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + Number(b.total ?? 0));
      const s = b.source ?? "unknown";
      const cur = bySource.get(s) ?? { total: 0, count: 0 };
      cur.total += Number(b.total ?? 0);
      cur.count += 1;
      bySource.set(s, cur);
      const key = b.guest_id ?? b.guest_email;
      const g = guestSpend.get(key) ?? { total: 0, stays: 0 };
      g.total += Number(b.total ?? 0);
      g.stays += 1;
      guestSpend.set(key, g);
    }

    const stays = active.length || 1;
    const totalRevenue = active.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const lifetimeValues = Array.from(guestSpend.values());
    const avgLtv =
      lifetimeValues.length > 0
        ? lifetimeValues.reduce((a, g) => a + g.total, 0) / lifetimeValues.length
        : 0;

    return {
      range: { from, to },
      totalRevenue,
      avgSpendPerStay: totalRevenue / stays,
      cancellationsCount: cancelled.length,
      cancellationImpact: cancelled.reduce((a, b) => a + Number(b.total ?? 0), 0),
      guestCount: guestSpend.size,
      avgLifetimeValue: avgLtv,
      byMonth: Array.from(byMonth.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      bySource: Array.from(bySource.entries()).map(([source, v]) => ({ source, ...v })),
      topGuests: Array.from(guestSpend.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
    };
  });

// ---------------------------------------------------------------------------
// Module 5 — Financial Reconciliation
// ---------------------------------------------------------------------------

export const getReconciliation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => filtersSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const from = data.from ?? daysAgo(30);
    const to = data.to ?? todayISO();
    const { data: bookings, error: bookingsError } = await context.supabase
      .from("bookings")
      .select(
        "id, reference, total, deposit_amount, balance_amount, paid_amount, currency, payment_status, payment_method, pesapal_order_tracking_id, payment_mismatch_at, created_at",
      )
      .gte("created_at", `${from}T00:00:00Z`)
      .lte("created_at", `${to}T23:59:59Z`);
    if (bookingsError) throw bookingsError;

    const bookingIds = (bookings ?? []).map((booking) => booking.id);
    const [ledgerResult, orphanResult] = await Promise.all([
      bookingIds.length > 0
        ? context.supabase
            .from("payment_events")
            .select("*")
            .in("booking_id", bookingIds)
        : Promise.resolve({ data: [], error: null }),
      context.supabase
        .from("payment_events")
        .select("*")
        .is("booking_id", null)
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`),
    ]);
    if (ledgerResult.error) throw ledgerResult.error;
    if (orphanResult.error) throw orphanResult.error;

    const { reconcileBookingLedger, getReconciliationEventAmount } = await import(
      "./finance-reconciliation"
    );
    const ledgerEvents = ledgerResult.data ?? [];
    const rows = (bookings ?? []).map((booking) => ({
      ...booking,
      ...reconcileBookingLedger(booking, ledgerEvents),
    }));

    const unclassifiedEvents = ledgerEvents.filter(
      (event) => getReconciliationEventAmount(event) === null,
    );
    const currencySummary = new Map<
      string,
      { bookings: number; booking_paid: number; event_paid: number; outstanding: number }
    >();
    for (const row of rows) {
      const currency = row.currency || "UNKNOWN";
      const summary = currencySummary.get(currency) ?? {
        bookings: 0,
        booking_paid: 0,
        event_paid: 0,
        outstanding: 0,
      };
      summary.bookings += 1;
      summary.booking_paid += Number(row.paid_amount ?? 0);
      summary.event_paid += row.events_total;
      summary.outstanding += Number(row.balance_amount ?? 0);
      currencySummary.set(currency, summary);
    }

    return {
      range: { from, to },
      matched: rows.filter((row) => row.matched).length,
      unmatched: rows.filter((row) => !row.matched),
      unmatchedEvents: orphanResult.data ?? [],
      unclassifiedEvents,
      currencySummary: Array.from(currencySummary.entries()).map(([currency, totals]) => ({
        currency,
        ...totals,
      })),
    };
  });

// ---------------------------------------------------------------------------
// Module 6 — Rate & Pricing Manager
// ---------------------------------------------------------------------------

const pricingRuleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  rule_type: z.enum([
    "seasonal",
    "weekend",
    "promo",
    "corporate",
    "package",
    "child",
    "extra_guest",
    "min_stay",
    "blackout",
  ]),
  scope: z.enum(["all", "room"]).default("all"),
  room_id: z.string().uuid().nullable().optional(),
  starts_on: z.string().nullable().optional(),
  ends_on: z.string().nullable().optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
  adjust_kind: z.enum(["percent", "fixed", "override"]).nullable().optional(),
  adjust_value: z.number().nullable().optional(),
  min_stay_nights: z.number().int().positive().nullable().optional(),
  code: z.string().nullable().optional(),
  priority: z.number().int().default(100),
  active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
});

export const listPricingRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { data, error } = await context.supabase
      .from("pricing_rules")
      .select("*")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const savePricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => pricingRuleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { id, ...rest } = data;
    if (id) {
      const { data: row, error } = await context.supabase
        .from("pricing_rules")
        .update(rest)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("pricing_rules")
      .insert(rest)
      .select("*")
      .single();
    if (error) throw error;
    return row;
  });

export const deletePricingRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { error } = await context.supabase.from("pricing_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Module 7 — Forecast
// ---------------------------------------------------------------------------

export const getRevenueForecast = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const horizon = 90;
    const to = daysAgo(-horizon);
    const [{ data: future }, { data: rooms }, { data: past }] = await Promise.all([
      context.supabase
        .from("bookings")
        .select("total, nights, status, check_in, created_at")
        .gt("check_in", todayISO())
        .lte("check_in", to),
      context.supabase.from("rooms").select("id, total_units"),
      context.supabase
        .from("bookings")
        .select("total, status, check_in, created_at")
        .gte("check_in", daysAgo(90))
        .lte("check_in", todayISO()),
    ]);
    const totalUnits = (rooms ?? []).reduce((a, r) => a + Number(r.total_units ?? 1), 0) || 1;
    const active = (future ?? []).filter((b) => b.status !== "cancelled");
    const pipeline = active.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const nightsBooked = active.reduce((a, b) => a + Number(b.nights ?? 0), 0);
    const expectedOccupancy = nightsBooked / (totalUnits * horizon);

    // Simple pace comparison — last 30 days new bookings vs previous 30
    const now = Date.now();
    const past30 = (past ?? []).filter(
      (b) => new Date(b.created_at).getTime() > now - 30 * 86_400_000 && b.status !== "cancelled",
    );
    const prev30 = (past ?? []).filter(
      (b) =>
        new Date(b.created_at).getTime() <= now - 30 * 86_400_000 &&
        new Date(b.created_at).getTime() > now - 60 * 86_400_000 &&
        b.status !== "cancelled",
    );
    const paceRevenue = past30.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const prevRevenue = prev30.reduce((a, b) => a + Number(b.total ?? 0), 0);
    const paceDelta = prevRevenue > 0 ? (paceRevenue - prevRevenue) / prevRevenue : 0;

    // Group forward pipeline by month
    const byMonth = new Map<string, number>();
    for (const b of active) {
      const m = String(b.check_in).slice(0, 7);
      byMonth.set(m, (byMonth.get(m) ?? 0) + Number(b.total ?? 0));
    }

    return {
      horizonDays: horizon,
      expectedOccupancy,
      expectedRevenue: pipeline,
      pipeline,
      paceDelta,
      past30Revenue: paceRevenue,
      prev30Revenue: prevRevenue,
      forecastVariance: paceDelta,
      byMonth: Array.from(byMonth.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  });

// ---------------------------------------------------------------------------
// Module 8 — Financial Alerts
// ---------------------------------------------------------------------------

export const listFinancialAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { data, error } = await context.supabase
      .from("financial_alerts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  });

export const scanFinancialAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { data: allowed } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["owner", "manager", "finance"] as never,
    });
    if (!allowed) throw new Error("Forbidden");

    const inserts: Array<Record<string, unknown>> = [];
    const today = todayISO();

    const { data: overdue } = await context.supabase
      .from("bookings")
      .select("id, reference, guest_name, balance_amount, currency, check_out, payment_status, status")
      .neq("status", "cancelled")
      .gt("balance_amount", 0)
      .lt("check_out", today);
    for (const b of overdue ?? []) {
      inserts.push({
        alert_type: "overdue_balance",
        severity: "warn",
        title: `Overdue balance — ${b.reference}`,
        detail: `${b.guest_name} checked out on ${b.check_out} with ${b.currency} ${b.balance_amount} outstanding.`,
        booking_id: b.id,
        reference: b.reference,
        amount: b.balance_amount,
        currency: b.currency,
      });
    }

    const { data: failed } = await context.supabase
      .from("bookings")
      .select("id, reference, guest_name, currency, total")
      .not("payment_failed_at", "is", null)
      .eq("payment_status", "unpaid")
      .gte("payment_failed_at", `${daysAgo(30)}T00:00:00Z`);
    for (const b of failed ?? []) {
      inserts.push({
        alert_type: "failed_payment",
        severity: "error",
        title: `Failed payment — ${b.reference}`,
        detail: `Payment failed for ${b.guest_name}.`,
        booking_id: b.id,
        reference: b.reference,
        amount: b.total,
        currency: b.currency,
      });
    }

    const { data: mismatches } = await context.supabase
      .from("bookings")
      .select("id, reference, guest_name, currency, total, payment_mismatch_at")
      .not("payment_mismatch_at", "is", null)
      .gte("payment_mismatch_at", `${daysAgo(60)}T00:00:00Z`);
    for (const b of mismatches ?? []) {
      inserts.push({
        alert_type: "unreconciled",
        severity: "warn",
        title: `Unreconciled payment — ${b.reference}`,
        detail: `Pesapal amount does not match booking total for ${b.guest_name}.`,
        booking_id: b.id,
        reference: b.reference,
        amount: b.total,
        currency: b.currency,
      });
    }

    const { data: missingInvoice } = await context.supabase
      .from("bookings")
      .select("id, reference, guest_name, currency, total, payment_status")
      .in("payment_status", ["paid", "deposit_paid"])
      .is("invoice_number", null);
    for (const b of missingInvoice ?? []) {
      inserts.push({
        alert_type: "missing_invoice",
        severity: "info",
        title: `Missing invoice — ${b.reference}`,
        detail: `Payment received but no invoice number issued for ${b.guest_name}.`,
        booking_id: b.id,
        reference: b.reference,
        amount: b.total,
        currency: b.currency,
      });
    }

    // Dedupe against existing open alerts by (alert_type, booking_id)
    const { data: existing } = await context.supabase
      .from("financial_alerts")
      .select("alert_type, booking_id")
      .eq("status", "open");
    const seen = new Set((existing ?? []).map((r) => `${r.alert_type}:${r.booking_id ?? ""}`));
    const fresh = inserts.filter(
      (i) => !seen.has(`${i.alert_type}:${(i.booking_id as string) ?? ""}`),
    );
    if (fresh.length > 0) {
      await context.supabase.from("financial_alerts").insert(fresh as never);
    }
    return { created: fresh.length, scanned: inserts.length };
  });

export const resolveFinancialAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["acknowledged", "resolved", "dismissed"]).default("resolved"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const { error } = await context.supabase
      .from("financial_alerts")
      .update({
        status: data.status,
        resolved_at: data.status === "resolved" ? new Date().toISOString() : null,
        resolved_by: context.userId,
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Module 9 — Financial Reports (CSV export data)
// ---------------------------------------------------------------------------

export const getFinancialReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        kind: z.enum(["daily", "weekly", "monthly", "occupancy", "source", "tax"]).default("daily"),
        from: z.string().optional(),
        to: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const from = data.from ?? daysAgo(30);
    const to = data.to ?? todayISO();
    const { data: rows } = await context.supabase
      .from("bookings")
      .select(
        "reference, check_in, check_out, nights, total, taxes, currency, source, country, status, payment_status, room_id",
      )
      .gte("check_in", from)
      .lte("check_in", to);
    const active = (rows ?? []).filter((b) => b.status !== "cancelled");
    return {
      kind: data.kind,
      range: { from, to },
      rows: active,
    };
  });