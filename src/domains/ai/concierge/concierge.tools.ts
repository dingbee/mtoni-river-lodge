import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ConciergeAvailabilityRoom, ConciergeIntentSignal, ConciergeBookingPlan } from "./concierge.types";
import { EXPERIENCES } from "./concierge.recommendations";

function getPublicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

export async function searchAvailability(input: {
  check_in: string;
  check_out: string;
}): Promise<ConciergeAvailabilityRoom[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(input.check_out)) return [];
  if (input.check_out <= input.check_in) return [];
  const sb = getPublicClient();
  const { data, error } = await sb.rpc("get_room_availability", {
    _check_in: input.check_in,
    _check_out: input.check_out,
  });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    slug: r.slug,
    name: r.name,
    base_price_usd: Number(r.base_price),
    max_occupancy: r.max_occupancy,
    is_available: r.is_available,
    min_available: r.min_available,
    nightly_total_usd: Number(r.nightly_total),
    nights: r.nights,
  }));
}

function buildBookingUrl(intent: ConciergeIntentSignal, roomSlug?: string): string {
  const params = new URLSearchParams();
  if (intent.detected.check_in) params.set("check_in", intent.detected.check_in);
  if (intent.detected.check_out) params.set("check_out", intent.detected.check_out);
  if (intent.detected.adults) params.set("adults", String(intent.detected.adults));
  if (intent.detected.children) params.set("children", String(intent.detected.children));
  if (roomSlug) params.set("room", roomSlug);
  const qs = params.toString();
  return qs ? `/book?${qs}` : "/book";
}

export function buildBookingPlan(
  intent: ConciergeIntentSignal,
  availability: ConciergeAvailabilityRoom[],
  preferredRoomSlug?: string,
): ConciergeBookingPlan | null {
  const ci = intent.detected.check_in;
  const co = intent.detected.check_out;
  if (!ci || !co) return null;
  const nights = intent.detected.nights ?? Math.round((new Date(co).getTime() - new Date(ci).getTime()) / 86400000);

  const room = preferredRoomSlug
    ? availability.find((r) => r.slug === preferredRoomSlug && r.is_available)
    : availability.find((r) => r.is_available);

  const interests = intent.detected.interests ?? [];
  const experiences = EXPERIENCES
    .filter((e) => e.tags.some((t) => interests.includes(t)))
    .slice(0, 3)
    .map((e) => ({ slug: e.slug, name: e.name }));

  return {
    check_in: ci,
    check_out: co,
    nights,
    adults: intent.detected.adults ?? 2,
    children: intent.detected.children ?? 0,
    room: room ? { slug: room.slug, name: room.name, nightly_total_usd: room.nightly_total_usd } : undefined,
    experiences,
    estimated_total_usd: room?.nightly_total_usd,
    booking_url: buildBookingUrl(intent, room?.slug ?? preferredRoomSlug),
  };
}