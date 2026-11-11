import { sendResendEmail } from "@/domains/ai/concierge/providers/resend-email.server";
import type { CommercialAdminClient } from "./commercial-payment.functions";

type FinanceNotificationAdmin = CommercialAdminClient;

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}
function amount(minor: number | string, currency: "TZS" | "USD") {
  const value = BigInt(minor);
  const whole = value / 100n;
  const fractional = (value % 100n).toString().padStart(2, "0");
  const formattedWhole = new Intl.NumberFormat("en-US", {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(whole);
  return `${formattedWhole}.${fractional}`;
}

export async function sendCommercialInvoiceIssuedEmail(input: { admin: FinanceNotificationAdmin; invoiceId: string }) {
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
  const rows = (lines ?? []).map((line: { description: string; quantity: number; amount_minor: number | string }) =>
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
    }, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY ?? "" } });
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

export async function sendCommercialPaymentConfirmationEmail(input: { admin: FinanceNotificationAdmin; paymentId: string }) {
  const { admin, paymentId } = input;
  const { data: payment, error } = await admin.from("commercial_payment_transactions").select("*").eq("id",paymentId).maybeSingle();
  if (error || !payment || !["successful","partially_reversed","reversed"].includes(payment.status)) {
    throw new Error("Verified payment could not be loaded for receipt notification.");
  }
  const { data: invoice, error: invoiceError } = await admin.from("commercial_invoices").select("*").eq("id",payment.invoice_id).maybeSingle();
  if (invoiceError || !invoice) throw new Error("Related invoice could not be loaded for receipt notification.");
  const { data: properties } = await admin.from("staynas_properties").select("id").eq("organisation_id",payment.organisation_id);
  const propertyIds = (properties ?? []).map((property: {id:string}) => property.id);
  if (!propertyIds.length) return { status: "skipped" as const, reason: "tenant_has_no_properties" };
  const { data: members } = await admin.from("staynas_property_members").select("user_id,role,status")
    .in("property_id",propertyIds).in("role",["owner","admin","manager"]).eq("status","active");
  const member = members?.[0];
  if (!member?.user_id) return { status: "skipped" as const, reason: "tenant_billing_admin_not_found" };
  const { data: userResult, error: userError } = await admin.auth.admin.getUserById(member.user_id);
  const recipient = userResult?.user?.email;
  if (userError || !recipient) return { status: "skipped" as const, reason: "tenant_billing_email_not_found" };
  const idempotencyKey = `cc04-payment-confirmed-${payment.id}`;
  const { data: existing } = await admin.from("commercial_financial_notifications")
    .select("id,status,provider_message_ref").eq("idempotency_key",idempotencyKey).maybeSingle();
  if (existing?.status === "sent") return { status: "sent" as const, providerMessageRef: existing.provider_message_ref };
  let notificationId = existing?.id as string | undefined;
  if (!notificationId) {
    const { data: inserted, error: insertError } = await admin.from("commercial_financial_notifications").insert({
      organisation_id: payment.organisation_id, invoice_id: invoice.id, payment_id: payment.id,
      notification_type: "payment_confirmation", recipient_email: recipient, idempotency_key: idempotencyKey,
      payload_snapshot: { invoiceNumber: invoice.invoice_number, amountMinor: payment.amount_minor, currency: payment.currency, paymentId: payment.id },
    }).select("id").single();
    if (insertError || !inserted) throw new Error("Payment receipt notification outbox record could not be created.");
    notificationId = inserted.id;
  }
  const from = process.env.STAYNAS_FINANCE_FROM_EMAIL;
  if (!from) {
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    return { status: "failed" as const, reason: "STAYNAS_FINANCE_FROM_EMAIL_not_configured" };
  }
  const html = `<h2>StayNas payment confirmation</h2><p>Invoice: ${escapeHtml(invoice.invoice_number)}</p>
    <p>Amount received: <strong>${amount(payment.amount_minor,payment.currency)}</strong></p>
    <p>Provider reference: ${escapeHtml(payment.provider_transaction_ref ?? "manual verification")}</p>
    <p>Payment status: ${escapeHtml(payment.status)}</p><p>Your receipt is available in your StayNas billing workspace.</p>`;
  try {
    const sent = await sendResendEmail({from,to:recipient,subject:`StayNas payment receipt — ${invoice.invoice_number}`,html,idempotencyKey}, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY ?? "" } });
    await admin.from("commercial_financial_notifications").update({status:"sent",provider_message_ref:sent.providerMessageId,attempted_at:sent.acceptedAt,sent_at:sent.acceptedAt}).eq("id",notificationId);
    return {status:"sent" as const,providerMessageRef:sent.providerMessageId};
  } catch (error) {
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    throw error;
  }
}

export async function sendCommercialPaymentFailureEmail(input: { admin: FinanceNotificationAdmin; paymentId: string }) {
  const { admin, paymentId } = input;
  const { data: payment, error } = await admin.from("commercial_payment_transactions").select("*").eq("id",paymentId).maybeSingle();
  if (error || !payment || payment.status !== "failed") throw new Error("Failed payment could not be loaded for notification.");
  const { data: invoice } = await admin.from("commercial_invoices").select("invoice_number,currency").eq("id",payment.invoice_id).maybeSingle();
  if (!invoice) throw new Error("Related invoice was not found for failure notification.");
  const { data: properties } = await admin.from("staynas_properties").select("id").eq("organisation_id",payment.organisation_id);
  const propertyIds = (properties ?? []).map((property: {id:string}) => property.id);
  if (!propertyIds.length) return {status:"skipped" as const,reason:"tenant_has_no_properties"};
  const { data: members } = await admin.from("staynas_property_members").select("user_id,role,status")
    .in("property_id",propertyIds).in("role",["owner","admin","manager"]).eq("status","active");
  const member=members?.[0];
  if (!member?.user_id) return {status:"skipped" as const,reason:"tenant_billing_admin_not_found"};
  const { data:userResult,error:userError }=await admin.auth.admin.getUserById(member.user_id);
  const recipient=userResult?.user?.email;
  if (userError || !recipient) return {status:"skipped" as const,reason:"tenant_billing_email_not_found"};
  const idempotencyKey=`cc04-payment-failed-${payment.id}`;
  const {data:existing}=await admin.from("commercial_financial_notifications").select("id,status,provider_message_ref")
    .eq("idempotency_key",idempotencyKey).maybeSingle();
  if (existing?.status==="sent") return {status:"sent" as const,providerMessageRef:existing.provider_message_ref};
  let notificationId=existing?.id as string|undefined;
  if (!notificationId) {
    const {data:inserted,error:insertError}=await admin.from("commercial_financial_notifications").insert({
      organisation_id:payment.organisation_id,invoice_id:invoice.id,payment_id:payment.id,
      notification_type:"payment_failure",recipient_email:recipient,idempotency_key:idempotencyKey,
      payload_snapshot:{invoiceNumber:invoice.invoice_number,paymentId:payment.id,status:payment.status},
    }).select("id").single();
    if (insertError || !inserted) throw new Error("Payment failure outbox record could not be created.");
    notificationId=inserted.id;
  }
  const from=process.env.STAYNAS_FINANCE_FROM_EMAIL;
  if (!from) {
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    return {status:"failed" as const,reason:"STAYNAS_FINANCE_FROM_EMAIL_not_configured"};
  }
  try {
    const sent=await sendResendEmail({
      from,to:recipient,subject:`StayNas payment unsuccessful — ${invoice.invoice_number}`,
      html:`<h2>StayNas payment unsuccessful</h2><p>Invoice: ${escapeHtml(invoice.invoice_number)}</p><p>Payment attempt: ${escapeHtml(payment.id)}</p><p>Please review the invoice and try another permitted payment method.</p>`,
      idempotencyKey,
    }, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY ?? "" } });
    await admin.from("commercial_financial_notifications").update({status:"sent",provider_message_ref:sent.providerMessageId,attempted_at:sent.acceptedAt,sent_at:sent.acceptedAt}).eq("id",notificationId);
    return {status:"sent" as const,providerMessageRef:sent.providerMessageId};
  } catch(error) {
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    throw error;
  }
}

export async function sendCommercialInvoiceReminderEmail(input: {
  admin: FinanceNotificationAdmin; invoiceId: string; notificationType: "upcoming_due" | "overdue_notice";
}) {
  const {admin,invoiceId,notificationType}=input;
  const {data:invoice,error}=await admin.from("commercial_invoice_receivables").select("*").eq("id",invoiceId).maybeSingle();
  if(error||!invoice||Number(invoice.outstanding_minor)<=0) throw new Error("Open invoice receivable not found.");
  const {data:properties}=await admin.from("staynas_properties").select("id").eq("organisation_id",invoice.organisation_id);
  const propertyIds=(properties??[]).map((property:{id:string})=>property.id);
  if(!propertyIds.length) return {status:"skipped" as const,reason:"tenant_has_no_properties"};
  const {data:members}=await admin.from("staynas_property_members").select("user_id,role,status")
    .in("property_id",propertyIds).in("role",["owner","admin","manager"]).eq("status","active");
  const member=members?.[0];
  if(!member?.user_id) return {status:"skipped" as const,reason:"tenant_billing_admin_not_found"};
  const {data:userResult,error:userError}=await admin.auth.admin.getUserById(member.user_id);
  const recipient=userResult?.user?.email;
  if(userError||!recipient) return {status:"skipped" as const,reason:"tenant_billing_email_not_found"};
  const idempotencyKey=`cc04-${notificationType}-${invoice.id}-${new Date(invoice.due_at).toISOString().slice(0,10)}`;
  const {data:existing}=await admin.from("commercial_financial_notifications").select("id,status,provider_message_ref")
    .eq("idempotency_key",idempotencyKey).maybeSingle();
  if(existing?.status==="sent") return {status:"sent" as const,providerMessageRef:existing.provider_message_ref};
  let notificationId=existing?.id as string|undefined;
  if(!notificationId){
    const {data:inserted,error:insertError}=await admin.from("commercial_financial_notifications").insert({
      organisation_id:invoice.organisation_id,invoice_id:invoice.id,notification_type:notificationType,
      recipient_email:recipient,idempotency_key:idempotencyKey,
      payload_snapshot:{invoiceNumber:invoice.invoice_number,currency:invoice.currency,outstandingMinor:invoice.outstanding_minor,dueAt:invoice.due_at},
    }).select("id").single();
    if(insertError||!inserted) throw new Error("Invoice reminder outbox record could not be created.");
    notificationId=inserted.id;
  }
  const from=process.env.STAYNAS_FINANCE_FROM_EMAIL;
  if(!from){
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    return {status:"failed" as const,reason:"STAYNAS_FINANCE_FROM_EMAIL_not_configured"};
  }
  const subject=notificationType==="upcoming_due"?"StayNas invoice due soon":"StayNas overdue invoice notice";
  const html=`<h2>${subject}</h2><p>Invoice: ${escapeHtml(invoice.invoice_number)}</p>
    <p>Outstanding: <strong>${amount(invoice.outstanding_minor,invoice.currency)}</strong></p>
    <p>Due date: ${escapeHtml(invoice.due_at)}</p><p>Please review your StayNas billing workspace to settle this balance.</p>`;
  try{
    const sent=await sendResendEmail({from,to:recipient,subject,html,idempotencyKey}, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY ?? "" } });
    await admin.from("commercial_financial_notifications").update({status:"sent",provider_message_ref:sent.providerMessageId,attempted_at:sent.acceptedAt,sent_at:sent.acceptedAt}).eq("id",notificationId);
    return {status:"sent" as const,providerMessageRef:sent.providerMessageId};
  }catch(error){
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    throw error;
  }
}

export async function sendCommercialUnallocatedPaymentEmail(input:{admin:FinanceNotificationAdmin;paymentId:string}) {
  const {admin,paymentId}=input;
  const {data:payment,error}=await admin.from("commercial_payment_transactions").select("*").eq("id",paymentId).maybeSingle();
  if(error||!payment||payment.invoice_id!==null||payment.status!=="successful") throw new Error("Verified unallocated collection not found.");
  const {data:properties}=await admin.from("staynas_properties").select("id").eq("organisation_id",payment.organisation_id);
  const propertyIds=(properties??[]).map((property:{id:string})=>property.id);
  if(!propertyIds.length) return {status:"skipped" as const,reason:"tenant_has_no_properties"};
  const {data:members}=await admin.from("staynas_property_members").select("user_id,role,status")
    .in("property_id",propertyIds).in("role",["owner","admin","manager"]).eq("status","active");
  const member=members?.[0];
  if(!member?.user_id) return {status:"skipped" as const,reason:"tenant_billing_admin_not_found"};
  const {data:userResult,error:userError}=await admin.auth.admin.getUserById(member.user_id);
  const recipient=userResult?.user?.email;
  if(userError||!recipient) return {status:"skipped" as const,reason:"tenant_billing_email_not_found"};
  const idempotencyKey=`cc04-unallocated-payment-${payment.id}`;
  const {data:existing}=await admin.from("commercial_financial_notifications").select("id,status,provider_message_ref")
    .eq("idempotency_key",idempotencyKey).maybeSingle();
  if(existing?.status==="sent") return {status:"sent" as const,providerMessageRef:existing.provider_message_ref};
  let notificationId=existing?.id as string|undefined;
  if(!notificationId){
    const {data:inserted,error:insertError}=await admin.from("commercial_financial_notifications").insert({
      organisation_id:payment.organisation_id,payment_id:payment.id,notification_type:"payment_confirmation",
      recipient_email:recipient,idempotency_key:idempotencyKey,
      payload_snapshot:{amountMinor:payment.amount_minor,currency:payment.currency,provider:payment.provider,providerReference:payment.provider_transaction_ref,unallocated:true},
    }).select("id").single();
    if(insertError||!inserted) throw new Error("Unallocated payment notification outbox record could not be created.");
    notificationId=inserted.id;
  }
  const from=process.env.STAYNAS_FINANCE_FROM_EMAIL;
  if(!from){
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    return {status:"failed" as const,reason:"STAYNAS_FINANCE_FROM_EMAIL_not_configured"};
  }
  try{
    const sent=await sendResendEmail({from,to:recipient,subject:"StayNas payment received — allocation pending",
      html:`<h2>StayNas payment received</h2><p>Amount: <strong>${amount(payment.amount_minor,payment.currency)}</strong></p><p>Reference: ${escapeHtml(payment.provider_transaction_ref)}</p><p>This collection is recorded and awaiting invoice allocation. No invoice has been marked paid by this receipt.</p>`,
      idempotencyKey}, { config: { apiKey: process.env.STAYNAS_PLATFORM_RESEND_API_KEY ?? "" } });
    await admin.from("commercial_financial_notifications").update({status:"sent",provider_message_ref:sent.providerMessageId,attempted_at:sent.acceptedAt,sent_at:sent.acceptedAt}).eq("id",notificationId);
    return {status:"sent" as const,providerMessageRef:sent.providerMessageId};
  }catch(error){
    await admin.from("commercial_financial_notifications").update({status:"failed",attempted_at:new Date().toISOString()}).eq("id",notificationId);
    throw error;
  }
}
