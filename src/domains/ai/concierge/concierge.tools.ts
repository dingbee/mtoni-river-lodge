import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { ConciergeAvailabilityRoom, ConciergeIntentSignal, ConciergeBookingPlan, ConciergeExperienceCatalogItem } from "./concierge.types";
import { bookingRpc } from "@/lib/booking-rpc";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

function getPublicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function mapAvailabilityForParty(
  rows: Array<Record<string, unknown>>,
  adults: number,
  children: number,
): ConciergeAvailabilityRoom[] {
  return rows.map((row) => {
    const capacityAdults = Number(row.capacity_adults ?? row.max_occupancy);
    const capacityChildren = Number(row.capacity_children ?? row.max_occupancy);
    const maxOccupancy = Number(row.max_occupancy);
    const fitsParty =
      Number.isFinite(adults) && Number.isFinite(children) &&
      adults > 0 && children >= 0 &&
      adults <= capacityAdults && children <= capacityChildren &&
      adults + children <= maxOccupancy;
    const currency = typeof row.currency === "string" ? row.currency.toUpperCase() : "";
    const basePrice = Number(row.base_price);
    const nightlyTotal = Number(row.nightly_total);
    return {
      slug: String(row.slug ?? ""),
      name: String(row.name ?? ""),
      base_price: Number.isFinite(basePrice) ? basePrice : 0,
      currency,
      max_occupancy: maxOccupancy,
      is_available: row.is_available === true,
      min_available: Number(row.min_available ?? 0),
      nightly_total: Number.isFinite(nightlyTotal) ? nightlyTotal : 0,
      nights: Number(row.nights ?? 0),
      fits_party: fitsParty,
    };
  });
}

export async function searchAvailability(input: {
  check_in: string;
  check_out: string;
  adults?: number;
  children?: number;
}): Promise<ConciergeAvailabilityRoom[]> {
  if (!isValidDate(input.check_in) || !isValidDate(input.check_out)) return [];
  if (input.check_out <= input.check_in) return [];
  const adults = input.adults ?? 2;
  const children = input.children ?? 0;
  if (!Number.isInteger(adults) || !Number.isInteger(children) || adults < 1 || children < 0 || adults + children > 20) return [];
  const sb = getPublicClient();
  try {
    const propertyId = await getConfiguredBookingPropertyId(sb);
    const { data, error } = await (bookingRpc(sb) as any).rpc("get_room_availability", {
      _check_in: input.check_in,
      _check_out: input.check_out,
      _property_id: propertyId,
    });
    if (error || !data) return [];
    return mapAvailabilityForParty(data as unknown as Array<Record<string, unknown>>, adults, children);
  } catch {
    // Do not leak property-resolution details to the guest.
    return [];
  }
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
  experiences: ConciergeExperienceCatalogItem[] = [],
): ConciergeBookingPlan | null {
  const ci = intent.detected.check_in;
  const co = intent.detected.check_out;
  if (!ci || !co || !isValidDate(ci) || !isValidDate(co) || co <= ci) return null;
  const nights = intent.detected.nights ?? Math.round((new Date(`${co}T00:00:00Z`).getTime() - new Date(`${ci}T00:00:00Z`).getTime()) / 86400000);
  if (!Number.isInteger(nights) || nights < 1) return null;

  const eligibleRooms = availability.filter((r) => r.is_available && r.fits_party);
  const room = (preferredRoomSlug
    ? eligibleRooms.find((r) => r.slug === preferredRoomSlug) ?? eligibleRooms[0]
    : eligibleRooms[0]);

  const selectedCurrency = room?.currency;
  const validRoomQuote = room &&
    /^[A-Z]{3}$/.test(room.currency) &&
    Number.isFinite(room.nightly_total) &&
    room.nightly_total >= 0 &&
    room.nights === nights;

  const selectedExperiences = experiences
    .filter((item) => Number.isFinite(item.price) && item.price >= 0 && item.currency === selectedCurrency)
    .slice(0, 3)
    .map((item) => ({ slug: item.slug, name: item.name, price: item.price, currency: item.currency, unit: item.unit }));

  return {
    check_in: ci,
    check_out: co,
    nights,
    adults: intent.detected.adults ?? 2,
    children: intent.detected.children ?? 0,
    room: validRoomQuote ? { slug: room.slug, name: room.name, total_price: room.nightly_total, currency: room.currency } : undefined,
    experiences: selectedExperiences,
    estimated_total: validRoomQuote ? room.nightly_total : undefined,
    currency: validRoomQuote ? room.currency : undefined,
    booking_url: buildBookingUrl(intent, validRoomQuote ? room.slug : undefined),
  };
}
