import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bookingRpc } from "@/lib/booking-rpc";

// First controlled Public Booking Network demo. Keep the UAT property allowlist
// explicit until StayNas has a property-level publication/visibility setting.
const PUBLIC_DEMO_PROPERTY_SLUGS = new Set(["nolmark-cdma-staynas"]);

async function resolvePublicDemoProperty(propertySlug: string) {
  if (!PUBLIC_DEMO_PROPERTY_SLUGS.has(propertySlug)) {
    throw new Error("This property booking page is not published.");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("staynas_properties")
    .select("id, slug, name, currency, timezone, status")
    .eq("slug", propertySlug)
    .maybeSingle();

  if (error) throw new Error("Unable to load this property.");
  if (!data || data.status !== "active") throw new Error("This property is not available for online reservations.");

  return { property: data, supabaseAdmin };
}

const propertySlugSchema = z.string().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getPublicDemoProperty = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => z.object({ propertySlug: propertySlugSchema }).parse(value))
  .handler(async ({ data }) => {
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);
    const { data: rooms, error } = await (supabaseAdmin as any)
      .from("rooms")
      .select("id, slug, name, short_description, bed_label, bathroom_label, amenities, max_occupancy, total_units, base_price, currency, included_guests, extra_guest_fee")
      .eq("property_id", property.id)
      .eq("status", "active")
      .order("sort_order", { ascending: true });

    if (error) {
      // Log only safe PostgREST diagnostics; never log credentials or guest data.
      console.error("[StayNas public booking] Room catalogue query failed", {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        propertyId: property.id,
      });
      throw new Error("Unable to load room information. Please try again later.");
    }

    return {
      property: {
        slug: property.slug,
        name: property.name,
        currency: property.currency,
        timezone: property.timezone,
      },
      rooms: (rooms ?? []).map((room: any) => ({
        ...room,
        base_price: Number(room.base_price),
        extra_guest_fee: Number(room.extra_guest_fee ?? 0),
      })),
      demo: true,
      paymentEnabled: false,
    };
  });

const availabilitySchema = z.object({
  propertySlug: propertySlugSchema,
  checkIn: dateSchema,
  checkOut: dateSchema,
  guests: z.number().int().min(1).max(8),
});

export const searchPublicDemoAvailability = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => availabilitySchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);
    const { data: rows, error } = await bookingRpc(supabaseAdmin).rpc("get_room_availability", {
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _property_id: property.id,
    });
    if (error) throw new Error(error.message);

    return (rows ?? [])
      .map((room: any) => ({
        ...room,
        base_price: Number(room.base_price),
        nightly_total: Number(room.nightly_total),
        fits_guests: data.guests <= room.max_occupancy,
      }))
      .filter((room: any) => room.is_available && room.fits_guests)
      .sort((a: any, b: any) => a.base_price - b.base_price);
  });

const createBookingSchema = z.object({
  propertySlug: propertySlugSchema,
  roomSlug: z.string().min(1).max(80),
  checkIn: dateSchema,
  checkOut: dateSchema,
  adults: z.number().int().min(1).max(8),
  children: z.number().int().min(0).max(6).default(0),
  guestName: z.string().trim().min(2).max(100),
  guestEmail: z.string().trim().email().max(255),
  guestPhone: z.string().trim().max(40).optional().or(z.literal("")),
  country: z.string().trim().max(100).optional().or(z.literal("")),
  specialRequests: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const createPublicDemoBooking = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => createBookingSchema.parse(value))
  .handler(async ({ data }) => {
    if (data.checkOut <= data.checkIn) throw new Error("Check-out must be after check-in.");
    const { property, supabaseAdmin } = await resolvePublicDemoProperty(data.propertySlug);

    // Use the existing property-scoped transactional booking RPC. The service
    // role is confined to this server function; the property ID is resolved
    // server-side from the explicit UAT demo allowlist and never trusted from
    // the browser.
    const { data: rows, error } = await bookingRpc(supabaseAdmin).rpc("create_booking", {
      _room_slug: data.roomSlug,
      _check_in: data.checkIn,
      _check_out: data.checkOut,
      _adults: data.adults,
      _children: data.children,
      _children_below_6: 0,
      _children_7_plus: data.children,
      _guest_name: data.guestName,
      _guest_email: data.guestEmail,
      _guest_phone: data.guestPhone || null,
      _country: data.country || null,
      _special_requests: data.specialRequests || null,
      _property_id: property.id,
      _extras: [],
    });

    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new Error("The reservation could not be created.");

    return {
      bookingId: row.booking_id,
      reference: row.reference,
      total: Number(row.total),
      currency: row.currency,
      propertyName: property.name,
      paymentStatus: "unpaid" as const,
      paymentEnabled: false,
    };
  });
