import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type InvoiceDocumentInput = {
  invoice: {
    invoice_number: string; currency: "TZS" | "USD"; billing_term: string;
    billing_period_start: string; billing_period_end: string; issued_at: string;
    due_at: string; subtotal_minor: number | string; tax_minor: number | string;
    discount_minor: number | string; total_minor: number | string;
    status: string;
  };
  lines: Array<{ description: string; quantity: number; unit_amount_minor: number | string; amount_minor: number | string }>;
  adjustments: Array<{ adjustment_ref: string; adjustment_type: string; amount_minor: number | string; reason_code: string }>;
};

function money(minor: number | string, currency: "TZS" | "USD") {
  const value = Number(minor) / 100;
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

/** Builds a PDF strictly from persisted invoice, line and adjustment records. */
export async function buildCommercialInvoicePdf(input: InvoiceDocumentInput) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const draw = (text: string, size = 10, isBold = false) => {
    if (y < 65) { page = pdf.addPage([595.28, 841.89]); y = 790; }
    page.drawText(text.slice(0, 110), { x: 48, y, size, font: isBold ? bold : regular, color: rgb(0.12, 0.16, 0.22) });
    y -= size + 9;
  };
  draw("STAYNAS — COMMERCIAL INVOICE", 18, true);
  draw(input.invoice.invoice_number, 12, true);
  draw(`Status: ${input.invoice.status}   Currency: ${input.invoice.currency}`);
  draw(`Billing term: ${input.invoice.billing_term}`);
  draw(`Period: ${new Date(input.invoice.billing_period_start).toISOString()} — ${new Date(input.invoice.billing_period_end).toISOString()}`);
  draw(`Issued: ${new Date(input.invoice.issued_at).toISOString()}   Due: ${new Date(input.invoice.due_at).toISOString()}`);
  y -= 12;
  draw("CHARGES", 12, true);
  for (const line of input.lines) {
    draw(`${line.description} | Qty ${line.quantity} | ${money(line.unit_amount_minor,input.invoice.currency)} | ${money(line.amount_minor,input.invoice.currency)}`);

  }
  y -= 8;
  draw(`Subtotal: ${money(input.invoice.subtotal_minor,input.invoice.currency)}`, 10, true);
  draw(`Tax: ${money(input.invoice.tax_minor,input.invoice.currency)}`);
  draw(`Discount: ${money(input.invoice.discount_minor,input.invoice.currency)}`);
  draw(`TOTAL: ${money(input.invoice.total_minor,input.invoice.currency)}`, 14, true);
  if (input.adjustments.length) {
    y -= 8;
    draw("POST-ISSUE ADJUSTMENTS", 11, true);
    for (const adjustment of input.adjustments) {
      draw(`${adjustment.adjustment_type} ${adjustment.adjustment_ref}: ${money(adjustment.amount_minor,input.invoice.currency)} — ${adjustment.reason_code}`);
    }
  }
  draw("This document is generated from the persisted StayNas commercial financial ledger.", 8);
  return await pdf.save();
}
