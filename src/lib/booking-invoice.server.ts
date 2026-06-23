// Generates a branded PDF invoice for a confirmed booking.
// Pure-JS via pdf-lib so it runs in the Cloudflare Worker runtime.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type InvoiceData = {
  reference: string;
  issuedAt: Date;
  guestName: string;
  guestEmail: string;
  guestPhone?: string | null;
  country?: string | null;
  roomName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  lineItems: { description: string; qty: number; unit: number; total: number }[];
  subtotal: number;
  extrasTotal: number;
  total: number;
  depositPaid: number;
  balanceDue: number;
};

const BRAND = rgb(47 / 255, 93 / 255, 58 / 255); // #2f5d3a
const MUTED = rgb(0.45, 0.45, 0.45);
const TEXT = rgb(0.17, 0.17, 0.17);
const LINE = rgb(0.88, 0.88, 0.88);

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function buildInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const left = 48;
  const right = width - 48;

  // Header band
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: BRAND });
  page.drawText("MTONI RIVER LODGE", {
    x: left, y: height - 45, size: 18, font: bold, color: rgb(1, 1, 1),
  });
  page.drawText("Arusha · Tanzania", {
    x: left, y: height - 65, size: 10, font: helv, color: rgb(0.92, 0.92, 0.92),
  });
  page.drawText("INVOICE", {
    x: right - bold.widthOfTextAtSize("INVOICE", 22),
    y: height - 50, size: 22, font: bold, color: rgb(1, 1, 1),
  });

  let y = height - 120;

  // Meta block
  const issued = data.issuedAt.toISOString().slice(0, 10);
  const metaRows: [string, string][] = [
    ["Invoice no.", data.reference],
    ["Issue date", issued],
    ["Status", "Deposit received"],
  ];
  metaRows.forEach(([k, v], i) => {
    page.drawText(k, { x: right - 230, y: y - i * 14, size: 9, font: helv, color: MUTED });
    page.drawText(v, { x: right - 130, y: y - i * 14, size: 10, font: bold, color: TEXT });
  });

  // Bill to
  page.drawText("Billed to", { x: left, y, size: 9, font: helv, color: MUTED });
  page.drawText(data.guestName, { x: left, y: y - 14, size: 11, font: bold, color: TEXT });
  page.drawText(data.guestEmail, { x: left, y: y - 28, size: 10, font: helv, color: TEXT });
  if (data.guestPhone) page.drawText(data.guestPhone, { x: left, y: y - 42, size: 10, font: helv, color: TEXT });
  if (data.country) page.drawText(data.country, { x: left, y: y - 56, size: 10, font: helv, color: TEXT });

  y -= 90;

  // Stay summary
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: LINE, thickness: 1 });
  y -= 18;
  page.drawText("Stay details", { x: left, y, size: 11, font: bold, color: BRAND });
  y -= 16;
  const stay: [string, string][] = [
    ["Room", data.roomName],
    ["Check-in", data.checkIn],
    ["Check-out", data.checkOut],
    ["Nights", String(data.nights)],
    ["Guests", `${data.adults} adult${data.adults > 1 ? "s" : ""}${data.children ? `, ${data.children} child${data.children > 1 ? "ren" : ""}` : ""}`],
  ];
  for (const [k, v] of stay) {
    page.drawText(k, { x: left, y, size: 10, font: helv, color: MUTED });
    page.drawText(v, { x: left + 110, y, size: 10, font: helv, color: TEXT });
    y -= 14;
  }

  y -= 10;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: LINE, thickness: 1 });
  y -= 22;

  // Line items header
  const colDesc = left;
  const colQty = right - 230;
  const colUnit = right - 150;
  const colTotal = right;
  page.drawText("Description", { x: colDesc, y, size: 9, font: bold, color: MUTED });
  page.drawText("Qty", { x: colQty, y, size: 9, font: bold, color: MUTED });
  page.drawText("Unit", { x: colUnit, y, size: 9, font: bold, color: MUTED });
  const totalLbl = "Total";
  page.drawText(totalLbl, { x: colTotal - bold.widthOfTextAtSize(totalLbl, 9), y, size: 9, font: bold, color: MUTED });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, color: LINE, thickness: 0.5 });
  y -= 14;

  for (const li of data.lineItems) {
    const desc = li.description.length > 56 ? li.description.slice(0, 53) + "..." : li.description;
    page.drawText(desc, { x: colDesc, y, size: 10, font: helv, color: TEXT });
    page.drawText(String(li.qty), { x: colQty, y, size: 10, font: helv, color: TEXT });
    page.drawText(fmtMoney(li.unit, data.currency), { x: colUnit, y, size: 10, font: helv, color: TEXT });
    const t = fmtMoney(li.total, data.currency);
    page.drawText(t, { x: colTotal - helv.widthOfTextAtSize(t, 10), y, size: 10, font: helv, color: TEXT });
    y -= 16;
  }

  y -= 6;
  page.drawLine({ start: { x: colUnit - 20, y }, end: { x: right, y }, color: LINE, thickness: 0.5 });
  y -= 16;

  const totals: [string, number, boolean][] = [
    ["Subtotal (room)", data.subtotal, false],
    ["Extras", data.extrasTotal, false],
    ["Total", data.total, true],
    ["Deposit paid", -data.depositPaid, false],
    ["Balance on arrival", data.balanceDue, true],
  ];
  for (const [label, amount, emph] of totals) {
    const font = emph ? bold : helv;
    page.drawText(label, { x: colUnit - 20, y, size: emph ? 11 : 10, font, color: emph ? BRAND : TEXT });
    const v = fmtMoney(amount, data.currency);
    page.drawText(v, {
      x: colTotal - font.widthOfTextAtSize(v, emph ? 11 : 10),
      y, size: emph ? 11 : 10, font, color: emph ? BRAND : TEXT,
    });
    y -= emph ? 18 : 15;
  }

  // Footer
  const footerY = 60;
  page.drawLine({ start: { x: left, y: footerY + 30 }, end: { x: right, y: footerY + 30 }, color: LINE, thickness: 0.5 });
  page.drawText("Thank you for choosing Mtoni River Lodge.", {
    x: left, y: footerY + 14, size: 10, font: bold, color: BRAND,
  });
  page.drawText("Questions? Reply to mtoniriver@gmail.com · mtoniriverlodge.com", {
    x: left, y: footerY, size: 9, font: helv, color: MUTED,
  });

  return pdf.save();
}

export async function buildInvoiceForBooking(bookingId: string): Promise<{ filename: string; bytes: Uint8Array } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: b } = await supabaseAdmin
    .from("bookings")
    .select("reference, guest_name, guest_email, guest_phone, country, check_in, check_out, nights, adults, children, currency, subtotal, extras_total, total, deposit_amount, balance_amount, room_id, created_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return null;

  const { data: room } = await supabaseAdmin.from("rooms").select("name").eq("id", b.room_id).maybeSingle();
  const { data: nightsRows } = await supabaseAdmin
    .from("booking_nights")
    .select("nightly_rate")
    .eq("booking_id", bookingId);
  const { data: extraRows } = await supabaseAdmin
    .from("booking_extras")
    .select("quantity, unit_price, line_total, extras(name)")
    .eq("booking_id", bookingId);

  const lineItems: InvoiceData["lineItems"] = [];
  const roomName = room?.name ?? "Room";
  const nightsCount = nightsRows?.length ?? b.nights;
  const roomSubtotal = Number(b.subtotal) || 0;
  const avgRate = nightsCount > 0 ? roomSubtotal / nightsCount : roomSubtotal;
  lineItems.push({
    description: `${roomName} - ${b.check_in} to ${b.check_out}`,
    qty: nightsCount,
    unit: avgRate,
    total: roomSubtotal,
  });
  for (const e of extraRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (e as any).extras?.name ?? "Extra";
    lineItems.push({
      description: name,
      qty: Number(e.quantity),
      unit: Number(e.unit_price),
      total: Number(e.line_total),
    });
  }

  const bytes = await buildInvoicePdf({
    reference: b.reference,
    issuedAt: new Date(),
    guestName: b.guest_name,
    guestEmail: b.guest_email,
    guestPhone: b.guest_phone,
    country: b.country,
    roomName,
    checkIn: b.check_in,
    checkOut: b.check_out,
    nights: b.nights,
    adults: b.adults,
    children: b.children ?? 0,
    currency: b.currency,
    lineItems,
    subtotal: Number(b.subtotal) || 0,
    extrasTotal: Number(b.extras_total) || 0,
    total: Number(b.total) || 0,
    depositPaid: Number(b.deposit_amount) || 0,
    balanceDue: Number(b.balance_amount) || 0,
  });

  return { filename: `Invoice-${b.reference}.pdf`, bytes };
}