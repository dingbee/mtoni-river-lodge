import { sendResendEmail } from "@/domains/ai/concierge/providers/resend-email.server";

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}
function amount(minor: number | string, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(minor) / 100);
}

export async function sendCommercialInvoiceIssuedEmail(input: { admin: any; invoiceId: string }) {
  const { admin, invoiceId } = input;
  const { data: invoice, error } = await admin.from("commercial_invoices").select("*").eq("id",invoiceId).maybeSingle();
  if (error || !invoice) throw new Error("Persisted invoice could not be loaded for notification.");
  const { data: lines, error: linesError } = await admin.from("commercial_invoice_lines").select("*").eq("invoice_id",invoiceId).order("created_at");
  if (linesError) throw new Error("Persisted invoice lines could not be loaded for notification.");
  const { data: properties } = await admin.from("staynas_properties").select("id").eq("organisation_id",invoice.organisation_id);
  const propertyIds = (properties ?? []).map((property: {id:string}) => property.id);
  if (!propertyIds.length) return { status: "skipped" as const, reason: "tenant_has_no_properties" };
  const { data: members } = await admin.from("staynas_property_members").select("user_id,role,status")
    .in("property_id",propertyIds).in("role",["owner","admin","manager"]).eq("status","active");
  const member = members?.[0];
  if (!member?.user_id) return { status: "skipped" as const, reason: "tenant_billing_admin_not_found" };
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(member.user_id);
  const recipient = userResult?.user?.email;
  if (userError || !recipient) return { status: "skipped" as const, reason: "tenant_billing_email_not_found" };

  const idempotencyKey = `cc04-invoice-issued-${invoice.id}`;
  const { data: existing } = await admin.from("commercial_financial_notifications")
    .select("id,status,provider_message_ref").eq("idempotency_key",idempotencyKey).maybeSingle();
  if (existing?.status === "sent") return { status: "sent" as const, providerMessageRef: existing.provider_message_ref };
  let notificationId = existing?.id as string | undefined;
  if (!notificationId) {
    const { data: inserted, error: insertError } = await admin.from("commercial_financial_notifications").insert({
      organisation_id: invoice.organisation_id, invoice_id: invoice.id,
      notification_type: "invoice_issued", recipient_email: recipient,
      idempotency_key: idempotencyKey,
      payload_snapshot: {
        invoiceNumber: invoice.invoice_number, currency: invoice.currency,
        totalMinor: invoice.total_minor, dueAt: invoice.due_at,
      },
    }).select("id").single();
    if (insertError || !inserted) throw new Error("Invoice notification outbox record could not be created.");
    notificationId = inserted.id;
  }
  const from = process.env.STAYNAS_FINANCE_FROM_EMAIL;
  if (!from) {
    await admin.from("commercial_financial_notifications").update({ status: "failed", attempted_at: new Date().toISOString() }).eq("id",notificationId);
    return { status: "failed" as const, reason: "STAYNAS_FINANCE_FROM_EMAIL_not_configured" };
  }
  const rows = (lines ?? []).map((line: any) =>
    `<tr><td>${escapeHtml(line.description)}</td><td>${line.quantity}</td><td>${amount(line.amount_minor,invoice.currency)}</td></tr>`
  ).join("");
  const html = `<h2>StayNas commercial invoice ${escapeHtml(invoice.invoice_number)}</h2>
    <p>Billing period: ${escapeHtml(invoice.billing_period_start)} — ${escapeHtml(invoice.billing_period_end)}</p>
    <table><thead><tr><th>Description</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <p><strong>Total due: ${amount(invoice.total_minor,invoice.currency)}</strong></p>
    <p>Due date: ${escapeHtml(invoice.due_at)}</p>
    <p>This notice is generated from your persisted StayNas commercial invoice.</p>`;
  try {
    const sent = await sendResendEmail({
      from, to: recipient, subject: `StayNas invoice ${invoice.invoice_number}`,
      html, idempotencyKey,
    });
    await admin.from("commercial_financial_notifications").update({
      status: "sent", provider_message_ref: sent.providerMessageId,
      attempted_at: sent.acceptedAt, sent_at: sent.acceptedAt,
    }).eq("id",notificationId);
    return { status: "sent" as const, providerMessageRef: sent.providerMessageId };
  } catch (error) {
    await admin.from("commercial_financial_notifications").update({
      status: "failed", attempted_at: new Date().toISOString(),
    }).eq("id",notificationId);
    throw error;
  }
}
