import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { aggregateRevenueLedger } from "./revenue-ledger";

const inputSchema = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
}).default({});

/**
 * Cash movement report sourced from the transaction ledger.
 * Queries execute under the authenticated Supabase client; payment_events RLS
 * joins through bookings and enforces property access. Recognition is not inferred.
 */
export const getRevenueIntelligence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => inputSchema.parse(value ?? {}))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "finance");
    const to = data.to ?? new Date().toISOString().slice(0, 10);
    const from = data.from ?? `${to.slice(0, 4)}-01-01`;
    if (from > to) throw new Error("Revenue range start must not be after its end");

    const { data: propertyId, error: propertyError } = await context.supabase.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error(propertyError?.message ?? "An active property is required for revenue intelligence.");
    const endExclusive = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + 86_400_000).toISOString();
    // Supabase applies a per-request row cap. Read bounded pages so the report
    // cannot silently understate totals when a date range exceeds that cap.
    const pageSize = 1000;
    async function readAll<T>(query: (fromRow: number, toRow: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
      const rows: T[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const result = await query(offset, offset + pageSize - 1);
        if (result.error) throw result.error;
        const page = result.data ?? [];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    }
    const bookings = await readAll((start, end) => context.supabase.from("bookings")
      .select("id, total, currency, status")
      .eq("property_id", propertyId)
      .gte("check_in", from).lte("check_in", to)
      .order("id").range(start, end));
    const bookingIds = bookings.map((booking) => booking.id);
    const events: Array<{ event_type: string; amount: number | string | null; currency: string | null; created_at: string }> = [];
    for (let index = 0; index < bookingIds.length; index += 100) {
      const ids = bookingIds.slice(index, index + 100);
      const chunk = await readAll((start, end) => context.supabase.from("payment_events")
        .select("event_type, amount, currency, created_at")
        .in("booking_id", ids)
        .gte("created_at", `${from}T00:00:00.000Z`)
        .lt("created_at", endExclusive)
        .order("created_at").order("id").range(start, end));
      events.push(...chunk);
    }

    const booked = new Map<string, number>();
    for (const booking of bookings) {
      if (booking.status === "cancelled") continue;
      const currency = (booking.currency ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      booked.set(currency, (booked.get(currency) ?? 0) + Number(booking.total ?? 0));
    }
    const ledger = aggregateRevenueLedger(events);
    const currencies = [...new Set([...booked.keys(), ...ledger.map((row) => row.currency)])].sort();

    return {
      range: { from, to, cashPeriod: "payment_event.created_at_utc", bookedValuePeriod: "booking.check_in" },
      accountingRecognition: { status: "not_configured" as const, recognisedRevenueByCurrency: [] as never[] },
      byCurrency: currencies.map((currency) => {
        const row = ledger.find((item) => item.currency === currency) ?? {
          currency, cashCollected: 0, refunds: 0, providerReversals: 0,
          netCashReceived: 0, successfulCollections: 0, refundEvents: 0, reversalEvents: 0,
        };
        const { currency: _currency, ...cashMetrics } = row;
        return { currency, bookedValue: booked.get(currency) ?? 0, ...cashMetrics };
      }),
      source: "payment_events",
    };
  });
