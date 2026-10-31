import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiToolId } from "./ai.types";

// Tools are executed with the caller's authenticated Supabase client, so
// RLS applies exactly as if the user queried the tables directly. No
// service-role client is used here.

type Ctx = { supabase: SupabaseClient<any, any, any>; propertyId: string };

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ToolDefinition {
  id: AiToolId;
  description: string;
  args?: string;
  run: (ctx: Ctx, args: any) => Promise<{ summary: string; data: unknown; count?: number; window?: string }>;
}

export const AI_TOOLS: Record<AiToolId, ToolDefinition> = {
  "guest.search": {
    id: "guest.search",
    description: "Search guests by name, email, or phone. args: { query: string }.",
    args: '{"query": "partial name or email"}',
    run: async ({ supabase }, args) => {
      const q = String(args.query ?? "").trim();
      if (!q) return { summary: "No query provided.", data: [], count: 0 };
      const like = `%${q}%`;
      const { data, error } = await supabase
        .from("guests")
        .select("id, full_name, email, phone_e164, country, status, vip_since")
        .or(`full_name.ilike.${like},email.ilike.${like},phone_e164.ilike.${like}`)
        .eq("is_deleted", false)
        .limit(10);
      if (error) throw error;
      return { summary: `Found ${data?.length ?? 0} guest(s) matching "${q}".`, data: data ?? [], count: data?.length ?? 0 };
    },
  },
  "guest.summary": {
    id: "guest.summary",
    description: "Fetch summary of one guest including preferences and stay count. args: { guest_id: uuid }.",
    args: '{"guest_id": "uuid"}',
    run: async ({ supabase, propertyId }, args) => {
      const id = String(args.guest_id ?? "");
      if (!id) return { summary: "guest_id required.", data: null };
      const [{ data: guest }, { data: prefs }, { count: stays }] = await Promise.all([
        supabase.from("guests").select("*").eq("id", id).maybeSingle(),
        supabase.from("guest_preferences").select("*").eq("guest_id", id),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("property_id", propertyId).eq("guest_id", id),
      ]);
      return { summary: guest ? `Guest ${guest.full_name ?? guest.email}, ${stays ?? 0} stay(s).` : "Guest not found.", data: { guest, preferences: prefs, stays }, count: stays ?? 0 };
    },
  },
  "reservations.arrivals_today": {
    id: "reservations.arrivals_today",
    description: "List bookings checking in today.",
    run: async ({ supabase, propertyId }) => {
      const t = today();
      const { data, error } = await supabase
        .from("bookings")
        .select("id, reference, guest_name, guest_email, room_id, check_in, check_out, status, guest_type")
        .eq("property_id", propertyId)
        .eq("check_in", t)
        .in("status", ["confirmed", "checked_in"])
        .order("guest_name");
      if (error) throw error;
      return { summary: `${data?.length ?? 0} arrival(s) today (${t}).`, data: data ?? [], count: data?.length ?? 0, window: t };
    },
  },
  "reservations.departures_today": {
    id: "reservations.departures_today",
    description: "List bookings checking out today.",
    run: async ({ supabase, propertyId }) => {
      const t = today();
      const { data, error } = await supabase
        .from("bookings")
        .select("id, reference, guest_name, room_id, check_in, check_out, balance_due, status")
        .eq("property_id", propertyId)
        .eq("check_out", t)
        .in("status", ["confirmed", "checked_in"])
        .order("guest_name");
      if (error) throw error;
      return { summary: `${data?.length ?? 0} departure(s) today (${t}).`, data: data ?? [], count: data?.length ?? 0, window: t };
    },
  },
  "reservations.upcoming": {
    id: "reservations.upcoming",
    description: "Bookings arriving in the next 7 days.",
    run: async ({ supabase, propertyId }) => {
      const from = today();
      const to = daysFromNow(7);
      const { data, error } = await supabase
        .from("bookings")
        .select("id, reference, guest_name, room_id, check_in, check_out, status, total, currency")
        .eq("property_id", propertyId)
        .gte("check_in", from)
        .lte("check_in", to)
        .in("status", ["confirmed", "pending"])
        .order("check_in")
        .limit(50);
      if (error) throw error;
      return { summary: `${data?.length ?? 0} upcoming arrival(s) in the next 7 days.`, data: data ?? [], count: data?.length ?? 0, window: `${from}..${to}` };
    },
  },
  "reservations.occupancy": {
    id: "reservations.occupancy",
    description: "Occupancy this month: total nights vs available room-nights.",
    run: async ({ supabase, propertyId }) => {
      const now = new Date();
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
      const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
      const daysInMonth = Math.round((new Date(nextMonth).getTime() - new Date(first).getTime()) / 86400000);

      const [{ data: bookings }, { data: rooms }] = await Promise.all([
        supabase.from("bookings")
          .select("nights, check_in, check_out, status")
          .eq("property_id", propertyId)
          .gte("check_in", first).lt("check_in", nextMonth)
          .in("status", ["confirmed", "checked_in", "checked_out"]),
        supabase.from("rooms").select("total_units").eq("property_id", propertyId).eq("status", "active"),
      ]);
      const soldNights = (bookings ?? []).reduce((sum, b: any) => sum + (b.nights ?? 0), 0);
      const totalUnits = (rooms ?? []).reduce((sum, r: any) => sum + (r.total_units ?? 0), 0);
      const capacity = totalUnits * daysInMonth;
      const pct = capacity > 0 ? Math.round((soldNights / capacity) * 100) : 0;
      return {
        summary: `Month-to-date occupancy ${pct}% (${soldNights}/${capacity} room-nights).`,
        data: { soldNights, capacity, occupancyPct: pct, month: first.slice(0, 7), reservations: bookings?.length ?? 0 },
        window: first.slice(0, 7),
      };
    },
  },
  "finance.revenue_summary": {
    id: "finance.revenue_summary",
    description: "Revenue totals for the current month from confirmed bookings.",
    run: async ({ supabase, propertyId }) => {
      const first = new Date(); first.setUTCDate(1);
      const from = first.toISOString().slice(0, 10);
      const [{ data, error }, { data: property, error: propertyError }] = await Promise.all([
        supabase
          .from("bookings")
          .select("total, paid_amount, balance_due, currency, status, payment_status")
          .eq("property_id", propertyId)
          .gte("check_in", from)
          .in("status", ["confirmed", "checked_in", "checked_out"]),
        supabase.from("staynas_properties").select("currency").eq("id", propertyId).single(),
      ]);
      if (error) throw error;
      if (propertyError || !property?.currency) throw new Error("Active property currency is not configured.");
      const rows = data ?? [];
      const grouped = new Map<string, { currency: string; gross: number; paid: number; outstanding: number; reservations: number }>();
      for (const row of rows as any[]) {
        const currency = row.currency ?? property.currency;
        const totals = grouped.get(currency) ?? { currency, gross: 0, paid: 0, outstanding: 0, reservations: 0 };
        totals.gross += Number(row.total ?? 0);
        totals.paid += Number(row.paid_amount ?? 0);
        totals.outstanding += Number(row.balance_due ?? 0);
        totals.reservations += 1;
        grouped.set(currency, totals);
      }
      const byCurrency = Array.from(grouped.values());
      const summary = byCurrency.length
        ? byCurrency.map((totals) => `${totals.currency} ${Math.round(totals.gross).toLocaleString()} gross · ${Math.round(totals.paid).toLocaleString()} paid · ${Math.round(totals.outstanding).toLocaleString()} outstanding (${totals.reservations} bookings)`).join("; ")
        : `No confirmed booking revenue recorded for ${from.slice(0, 7)}.`;
      return {
        summary,
        data: { byCurrency, reservations: rows.length, propertyCurrency: property.currency },
        count: rows.length,
        window: from.slice(0, 7),
      };
    },
  },
  "finance.outstanding": {
    id: "finance.outstanding",
    description: "Bookings with unpaid balances.",
    run: async ({ supabase, propertyId }) => {
      const [{ data, error }, { data: property, error: propertyError }] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, reference, guest_name, guest_email, check_in, balance_due, total, currency, payment_status, status")
          .eq("property_id", propertyId)
          .gt("balance_due", 0)
          .in("status", ["confirmed", "checked_in", "checked_out"])
          .order("balance_due", { ascending: false })
          .limit(25),
        supabase.from("staynas_properties").select("currency").eq("id", propertyId).single(),
      ]);
      if (error) throw error;
      if (propertyError || !property?.currency) throw new Error("Active property currency is not configured.");
      const rows = data ?? [];
      const grouped = new Map<string, number>();
      for (const row of rows as any[]) {
        const currency = row.currency ?? property.currency;
        grouped.set(currency, (grouped.get(currency) ?? 0) + Number(row.balance_due ?? 0));
      }
      const totals = Array.from(grouped.entries()).map(([currency, amount]) => ({ currency, amount }));
      const summary = totals.length
        ? `${rows.length} bookings with unpaid balances: ${totals.map((item) => `${item.currency} ${Math.round(item.amount).toLocaleString()}`).join("; ")}.`
        : "No outstanding booking balances.";
      return { summary, data: { bookings: rows, totalsByCurrency: totals }, count: rows.length };
    },
  },
  "finance.recent_transactions": {
    id: "finance.recent_transactions",
    description: "Most recent payment events.",
    run: async ({ supabase }) => {
      const { data, error } = await supabase
        .from("payment_events")
        .select("id, booking_id, provider, event_type, amount, currency, status_code, created_at")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return { summary: `Last ${data?.length ?? 0} payment event(s).`, data: data ?? [], count: data?.length ?? 0 };
    },
  },
  "operations.room_status": {
    id: "operations.room_status",
    description: "Current room states across the property.",
    run: async ({ supabase, propertyId }) => {
      const { data, error } = await supabase
        .from("room_states")
        .select("id, room_id, unit_label, state, state_note, booking_id, updated_at")
        .eq("property_id", propertyId)
        .order("unit_label");
      if (error) throw error;
      const rows = data ?? [];
      const grouped: Record<string, number> = {};
      for (const r of rows as any[]) grouped[r.state] = (grouped[r.state] ?? 0) + 1;
      const parts = Object.entries(grouped).map(([k, v]) => `${v} ${k}`).join(", ");
      return { summary: `${rows.length} units · ${parts || "no state data"}.`, data: { rows, grouped }, count: rows.length };
    },
  },
  "operations.open_tasks": {
    id: "operations.open_tasks",
    description: "Open operations tasks (housekeeping, maintenance, other).",
    run: async ({ supabase, propertyId }) => {
      const { data, error } = await supabase
        .from("ops_tasks")
        .select("id, title, task_type, priority, status, due_at, assignee_id, booking_id, category")
        .in("status", ["open", "in_progress"])
        .order("priority", { ascending: false })
        .limit(50);
      if (error) throw error;
      return { summary: `${data?.length ?? 0} open task(s).`, data: data ?? [], count: data?.length ?? 0 };
    },
  },
  "operations.alerts": {
    id: "operations.alerts",
    description: "Active operational alerts.",
    run: async ({ supabase, propertyId }) => {
      const { data, error } = await supabase
        .from("ops_alerts")
        .select("id, kind, severity, message, booking_id, room_id, created_at")
        .is("resolved_at", null)
        .order("severity", { ascending: false })
        .limit(50);
      if (error) throw error;
      return { summary: `${data?.length ?? 0} unresolved alert(s).`, data: data ?? [], count: data?.length ?? 0 };
    },
  },
  "marketing.latest_articles": {
    id: "marketing.latest_articles",
    description: "Recently published journal articles.",
    run: async ({ supabase, propertyId }) => {
      const { data, error } = await supabase
        .from("journal_articles")
        .select("id, slug, title, status, published_at, featured")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return { summary: `${data?.length ?? 0} recently published article(s).`, data: data ?? [], count: data?.length ?? 0 };
    },
  },
  "marketing.seo_status": {
    id: "marketing.seo_status",
    description: "SEO overrides configured across routes.",
    run: async ({ supabase, propertyId }) => {
      const { data, error } = await supabase
        .from("seo_overrides")
        .select("route_path, title, description, index_status, updated_at")
        .order("route_path")
        .limit(50);
      if (error) throw error;
      const rows = data ?? [];
      const noindex = rows.filter((r: any) => r.index_status === "noindex").length;
      return { summary: `${rows.length} route(s) with SEO overrides; ${noindex} marked noindex.`, data: rows, count: rows.length };
    },
  },
  "knowledge.search": {
    id: "knowledge.search",
    description: "Search Mtoni's internal knowledge base (SOPs, policies, brand, experiences). Use whenever the question is procedural, definitional, or reference-based. args: { query: string }.",
    args: '{"query": "keywords or a short phrase"}',
    run: async ({ supabase, propertyId }, args) => {
      const q = String(args.query ?? "").trim();
      if (!q) return { summary: "No query provided.", data: [], count: 0 };
      const { memoizeTTL } = await import("@/lib/perf-cache");
      const rows = await memoizeTTL(`kb:tools:${propertyId}:${q.toLowerCase()}:6`, 60_000, async () => {
        const { data, error } = await supabase.rpc("knowledge_search", { _query: q, _limit: 6 });
        if (error) throw error;
        return (data ?? []) as Array<any>;
      });
      return {
        summary: rows.length
          ? `Found ${rows.length} knowledge excerpt(s) for "${q}".`
          : `No knowledge base entries matched "${q}".`,
        data: rows,
        count: rows.length,
      };
    },
  },
};

export function toolCatalog(allowed: AiToolId[]): string {
  return allowed
    .map((id) => `- ${id}: ${AI_TOOLS[id].description}${AI_TOOLS[id].args ? ` args=${AI_TOOLS[id].args}` : ""}`)
    .join("\n");
}
