// Public availability search — the /book flow and external partners call this.
// GET /api/public/availability/search?check_in=YYYY-MM-DD&check_out=YYYY-MM-DD[&guests=2]

import { createFileRoute } from "@tanstack/react-router";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

export const Route = createFileRoute("/api/public/availability/search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const checkIn = url.searchParams.get("check_in");
        const checkOut = url.searchParams.get("check_out");
        const guests = Math.max(1, Math.min(20, Number(url.searchParams.get("guests") ?? "1")));
        const ratePlanId = url.searchParams.get("rate_plan_id");
        if (ratePlanId && !/^[0-9a-f-]{36}$/i.test(ratePlanId)) return Response.json({ error: "rate_plan_id must be a UUID" }, { status: 400 });
        if (!checkIn || !checkOut || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
          return Response.json({ error: "check_in and check_out are required (YYYY-MM-DD)" }, { status: 400 });
        }
        if (checkOut <= checkIn) {
          return Response.json({ error: "check_out must be after check_in" }, { status: 400 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const propertyId = await getConfiguredBookingPropertyId(supabaseAdmin);
        const { data, error } = await (supabaseAdmin as any).rpc("get_staynas_room_availability_priced_with_rate_plan", {
          _check_in: checkIn,
          _check_out: checkOut,
          _property_id: propertyId,
          _adults: guests,
          _children_below_6: 0,
          _children_7_plus: 0,
          _rate_plan_id: ratePlanId,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const pricing_errors = (data ?? [])
          .filter((r: any) => r.pricing_quote?.ok === false && r.pricing_quote?.error_code !== "RATE_PLAN_REQUIRED")
          .map((r: any) => ({ room_id: r.room_id, slug: r.slug, error_code: r.pricing_quote.error_code, message: r.pricing_quote.message }));
        const planChoices = await Promise.all((data ?? []).filter((r: any) => r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED").map(async (r: any) => {
          const { data: discovery, error: discoveryError } = await (supabaseAdmin as any).rpc("discover_staynas_public_rate_plans", {
            _property_id: propertyId, _room_id: r.room_id, _check_in: checkIn, _check_out: checkOut, _adults: guests, _children_below_6: 0, _children_7_plus: 0,
          });
          return { room_id: r.room_id, plans: !discoveryError && discovery?.ok ? discovery.plans : [] };
        }));
        const planOptionsByRoom = new Map(planChoices.map((x: any) => [x.room_id, x.plans]));
        const rooms = (data ?? [])
          .filter((r: any) => r.pricing_quote?.ok !== false || r.pricing_quote?.error_code === "RATE_PLAN_REQUIRED")
          .map((r: any) => ({
            slug: r.slug,
            name: r.name,
            base_price: Number(r.base_price),
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
          .filter((r: any) => r.is_available && r.fits_guests)
          .sort((a: any, b: any) => a.nightly_total - b.nightly_total);
        return Response.json(
          { check_in: checkIn, check_out: checkOut, guests, rate_plan_id: ratePlanId, rooms, pricing_errors },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});