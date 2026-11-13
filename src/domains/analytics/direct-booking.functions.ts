import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

const rangeSchema = z.discriminatedUnion("range", [
  z.object({ range: z.enum(["today", "yesterday", "7d", "30d", "90d"]) }),
  z.object({ range: z.literal("custom"), from: z.string().date(), to: z.string().date() }),
]);

function dateInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const value = (key: string) => parts.find((part) => part.type === key)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localMidnightUtc(value: string, timezone: string) {
  const target = Date.parse(`${value}T00:00:00.000Z`);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(values.year), Number(values.month) - 1, Number(values.day),
      Number(values.hour), Number(values.minute), Number(values.second),
    );
    const correction = target - represented;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate).toISOString();
}

export const getDirectBookingAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => rangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "direct-booking.analytics");
    const { data: propertyId, error: activeError } = await context.supabase.rpc(
      "staynas_active_property_id", { _uid: context.userId },
    );
    if (activeError || !propertyId) throw new Error("Select an active property to view booking analytics.");

    const { data: property, error: propertyError } = await context.supabase
      .from("staynas_properties")
      .select("id,name,currency,timezone,organisation_id")
      .eq("id", propertyId)
      .single();
    if (propertyError || !property?.timezone || !property.currency) {
      throw new Error("The active property must have a valid reporting timezone and currency.");
    }

    const today = dateInZone(new Date(), property.timezone);
    let from: string;
    let to: string;
    if (data.range === "custom") {
      from = data.from;
      to = data.to;
      if (to < from) throw new Error("The reporting end date must not precede the start date.");
      const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
      if (span > 365) throw new Error("Custom reporting ranges are limited to 366 calendar days.");
    } else if (data.range === "today") {
      from = today; to = today;
    } else if (data.range === "yesterday") {
      from = addDays(today, -1); to = from;
    } else {
      const days = Number(data.range.slice(0, -1));
      from = addDays(today, -(days - 1)); to = today;
    }

    const startAt = localMidnightUtc(from, property.timezone);
    const endAt = localMidnightUtc(addDays(to, 1), property.timezone);
    const { data: report, error: reportError } = await (context.supabase as any).rpc(
      "staynas_get_booking_analytics",
      { _property_id: propertyId, _from: startAt, _to: endAt },
    );
    if (reportError) throw new Error(reportError.message);

    return {
      property: { id: property.id, name: property.name, currency: property.currency, timezone: property.timezone },
      period: { from, to, range: data.range },
      report: report as Record<string, any>,
    };
  });
