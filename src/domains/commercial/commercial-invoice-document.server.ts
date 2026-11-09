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
  const value = BigInt(minor);
  const whole = value / 100n;
  const fractional = (value % 100n).toString().padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(whole);
  return `${formattedWhole}.${fractional}`;
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

export async function buildCommercialPaymentReceiptPdf(input: {
  payment: { id: string; provider: string; provider_transaction_ref: string | null; amount_minor: number | string; currency: "TZS" | "USD"; confirmed_at: string | null; payment_method: string | null };
  invoice: { invoice_number: string; currency: "TZS" | "USD" };
  allocation: { settlement_ref: string; amount_minor: number | string; allocated_at: string };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28,841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let y = 790;
  const draw = (text: string,size=11,isBold=false) => {
    page.drawText(text.slice(0,110),{x:48,y,size,font:isBold?bold:regular,color:rgb(0.12,0.16,0.22)});
    y -= size + 12;
  };
  draw("STAYNAS — PAYMENT RECEIPT",18,true);
  draw(`Receipt: ${input.allocation.settlement_ref}`,12,true);
  draw(`Invoice: ${input.invoice.invoice_number}`);
  draw(`Payment ID: ${input.payment.id}`);
  draw(`Provider: ${input.payment.provider} / ${input.payment.payment_method ?? "unspecified"}`);
  draw(`Provider transaction: ${input.payment.provider_transaction_ref ?? "verified manual record"}`);
  draw(`Confirmed: ${input.payment.confirmed_at ?? input.allocation.allocated_at}`);
  draw(`Amount received: ${money(input.allocation.amount_minor,input.invoice.currency)}`,14,true);
  draw("This receipt is generated from the persisted StayNas payment and allocation ledger.",9);
  return await pdf.save();
}

export async function buildCommercialUnallocatedReceiptPdf(input:{
  payment:{id:string;provider:string;provider_transaction_ref:string|null;amount_minor:number|string;currency:"TZS"|"USD";confirmed_at:string|null;payment_method:string|null};
  allocation?:{settlement_ref:string;amount_minor:number|string;invoice_number:string|null}|null;
  unallocatedMinor:number|string;
}) {
  const pdf=await PDFDocument.create();
  const page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  const draw=(text:string,size=11,isBold=false,y=790)=>{
    page.drawText(text.slice(0,110),{x:48,y,size,font:isBold?bold:regular,color:rgb(0.12,0.16,0.22)});
  };
  draw("STAYNAS — UNALLOCATED COLLECTION RECEIPT",16,true,790);
  draw(`Payment ID: ${input.payment.id}`,11,false,750);
  draw(`Provider: ${input.payment.provider} / ${input.payment.payment_method??"unspecified"}`,11,false,725);
  draw(`Provider reference: ${input.payment.provider_transaction_ref??"verified manual record"}`,11,false,700);
  draw(`Confirmed: ${input.payment.confirmed_at??"not available"}`,11,false,675);
  draw(`Amount received: ${money(input.payment.amount_minor,input.payment.currency)}`,14,true,635);
  if(input.allocation){
    draw(`Allocation reference: ${input.allocation.settlement_ref}`,11,false,595);
    draw(`Invoice: ${input.allocation.invoice_number??"not available"}`,11,false,570);
    draw(`Allocated amount: ${money(input.allocation.amount_minor,input.payment.currency)}`,11,false,545);
  }
  const unallocated=BigInt(input.unallocatedMinor);
  if(unallocated>0n) draw(`Unallocated balance: ${money(unallocated.toString(),input.payment.currency)}`,11,true,510);
  else draw("No unallocated balance remains for this collection.",10,false,510);
  return await pdf.save();
}
