// Public availability search — the /book flow and external partners call this.
// GET /api/public/availability/search?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD[&guests=2]

import { createFileRoute } from "@tanstack/react-router";
import { resolvePublicDirectBookingChannel } from "@/lib/public-booking-channel.server";

interface PublicPricingQuote {
  ok?: boolean;
  error_code?: string;
  message?: string;
  total?: number;
  nightly?: Array<{ nightly_rate?: number }>;
  pricing_evidence?: { rate_plan_id?: string | null };
}
interface PublicAvailabilityRow {
  room_id: string;
  slug: string;
  name: string;
  base_price: number;
  currency: string;
  max_occupancy: number;
  nights: number;
  nightly_total: number;
  min_available: number;
  is_available: boolean;
  fits_occupancy: boolean;
  pricing_quote?: PublicPricingQuote | null;
}
interface PublicRatePlanOption { currency?: string | null; [key: string]: unknown; }
interface PublicRpcClient { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>; }

export const Route = createFileRoute("/api/public/availability/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const checkIn = url.searchParams.get("check_in");
        const checkOut = url.searchParams.get("check_out");
        const guests = Number(url.searchParams.get("guests") ?? "1");
        if (!Number.isInteger(guests) || guests < 1 || guests > 20) return Response.json({ error: "guests must be an integer from 1 to 20" }, { status: 400 });
        const ratePlanId = url.searchParams.get("rate_plan_id");
        if (ratePlanId && !/^[0-9a-f-]{36}$/i.test(ratePlanId)) return Response.json({ error: "rate_plan_id must be a UUID" }, { status: 400 });
        if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
          return Response.json({ error: "check_in and check_out are required (YYYY-MM-DD)" }, { status: 400 });
        }
        if (checkOut <= checkIn) {
          return Response.json({ error: "check_out must be after check_in" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const channel = await resolvePublicDirectBookingChannel(supabaseAdmin, request.headers.get("host") ?? url.host);
        const propertyId = channel.propertyId;
        const publicRpc = supabaseAdmin as unknown as PublicRpcClient;
        const { data, error } = await publicRpc.rpc("get_staynas_room_availability_priced_with_rate_plan", {
          _check_in: checkIn,
          _check_out: checkOut,
          _property_id: propertyId,
          _adults: guests,
          _children_below_6: 0,
          _children_7_plus: 0,
          _rate_plan_id: ratePlanId,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const availabilityRows = (data ?? []) as PublicAvailabilityRow[];
        if (availabilityRows.some((r) => String(r.currency ?? "").toUpperCase() !== channel.currency)) {
          return Response.json({ error: "Room currency does not match the published direct-booking transaction currency" }, { status: 409 });
        }
        const pricing_errors = availabilityRows
          .filter((r) => r.pricing_quote?.ok === false && r.pricing_quote?.error_code !== "RATE_PLAN_REQUIRED")
          .map((r) => ({ room_id: r.room_id, slug: r.slug, error_code: r.pricing_quote?.error_code, message: r.pricing_quote?.message }));
        const planChoices = await Promise.all(availabilityRows.filter((r) => r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" || r.pricing_quote?.pricing_evidence?.rate_plan_id).map(async (r) => {
          const { data: discoveryData, error: discoveryError } = await publicRpc.rpc("discover_staynas_public_rate_plans", {
            _property_id: propertyId, _room_id: r.room_id, _check_in: checkIn, _check_out: checkOut, _adults: guests, _children_below_6: 0, _children_7_plus: 0,
          });
          const discovery = discoveryData as { ok?: boolean; plans?: PublicRatePlanOption[] } | null;
          return { room_id: r.room_id, plans: (!discoveryError && discovery?.ok ? discovery.plans ?? [] : []) };
        }));
        if (planChoices.some((x) => (x.plans ?? []).some((plan) => String(plan.currency ?? "").toUpperCase() !== channel.currency))) {
          return Response.json({ error: "Published rate-plan currency does not match the direct-booking channel" }, { status: 409 });
        }
        const planOptionsByRoom = new Map<string, PublicRatePlanOption[]>(planChoices.map((x) => [x.room_id, x.plans]));
        const rooms = availabilityRows
          .filter((r) => r.pricing_quote?.ok !== false || r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED")
          .map((r) => ({
            slug: r.slug,
            name: r.name,
            base_price: r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(r.base_price),
            currency: r.currency,
            max_occupancy: r.max_occupancy,
            nights: r.nights,
            nightly_total: r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(r.pricing_quote?.total ?? r.nightly_total),
            nightly_rate: r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED" ? null : Number(r.pricing_quote?.nightly?.[0]?.nightly_rate ?? r.base_price),
            available_units: Math.max(0, r.min_available),
            is_available: r.is_available,
            fits_guests: r.fits_occupancy,
            pricing_quote: r.pricing_quote,
            rate_plan_options: planOptionsByRoom.get(r.room_id) ?? [],
          }))
          .filter((r) => r.is_available && r.fits_guests)
          .sort((a, b) => (a.nightly_total ?? Number.POSITIVE_INFINITY) - (b.nightly_total ?? Number.POSITIVE_INFINITY));
        return Response.json(
          { check_in: checkIn, check_out: checkOut, guests, rate_plan_id: ratePlanId, rooms, pricing_errors },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});