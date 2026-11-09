import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";
import { calculateCommercialProration } from "./commercial-billing-engine";

const invoiceInput = z.object({
  subscriptionId: z.string().uuid(),
  periodStart: z.string().datetime({ offset: true }),
  periodEnd: z.string().datetime({ offset: true }),
  dueAt: z.string().datetime({ offset: true }),
  idempotencyKey: z.string().trim().min(8).max(200),
  taxSnapshot: z.record(z.string(), z.unknown()),
  discountSnapshot: z.record(z.string(), z.unknown()).default({ amountMinor: 0, policyRef: "none" }),
});
const paymentInput = z.object({
  invoiceId: z.string().uuid(),
  providerAccountId: z.string().uuid(),
  amountMinor: z.number().int().positive().safe(),
  currency: z.enum(["TZS", "USD"]),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const manualConfirmInput = z.object({
  paymentId: z.string().uuid(),
  receiptReference: z.string().trim().min(4).max(200),
  amountMinor: z.number().int().positive().safe(),
  currency: z.enum(["TZS", "USD"]),
  idempotencyKey: z.string().trim().min(8).max(200),
  evidenceReference: z.string().trim().min(4).max(200),
});
const reversalInput = z.object({
  paymentId: z.string().uuid(),
  reversalReference: z.string().trim().min(4).max(200),
  amountMinor: z.number().int().positive().safe(),
  currency: z.enum(["TZS", "USD"]),
  reasonCode: z.string().trim().min(2).max(120),
  idempotencyKey: z.string().trim().min(8).max(200),
});

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // CC-04 tables are not yet represented in the generated Supabase Database type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export type CommercialAdminClient = Awaited<ReturnType<typeof getAdmin>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeFinancialAudit(admin: any, input: {
  requestId: string; actorUserId: string | null; organisationId: string | null;
  actorRole: "founder_admin" | "tenant_admin" | "service_principal";
  action: string; resourceType: string; resourceRef: string;
  outcome?: "succeeded" | "denied" | "failed"; reasonCode?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await admin.from("commercial_financial_audit_events").insert({
    request_id: input.requestId, actor_user_id: input.actorUserId,
    actor_organisation_id: input.organisationId, actor_role: input.actorRole,
    action: input.action, resource_type: input.resourceType,
    resource_ref: input.resourceRef, outcome: input.outcome ?? "succeeded",
    reason_code: input.reasonCode ?? null, metadata: input.metadata ?? {},
  });
  if (error) throw new Error("Financial audit persistence failed.");
}

export const listMyCommercialInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data, error } = await admin.from("commercial_invoice_receivables").select("*")
      .eq("organisation_id", actor.organisationId).neq("status","draft").order("issued_at", { ascending: false });
    if (error) throw new Error("Unable to load tenant invoices.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"invoice.tenant_list_viewed",
      resourceType:"invoice_index",resourceRef:actor.organisationId,metadata:{rowCount:data?.length??0}});
    return data ?? [];
  });

export const listCommercialInvoicesForFounder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data, error } = await admin.from("commercial_invoice_receivables").select("*")
      .order("issued_at", { ascending: false });
    if (error) throw new Error("Unable to load commercial receivables.");
    await writeFinancialAudit(admin, {
      requestId: globalThis.crypto.randomUUID(), actorUserId: actor.userId,
      organisationId: actor.organisationId, actorRole: "founder_admin",
      action: "receivables.viewed", resourceType: "receivables_report",
      resourceRef: "platform", metadata: { rowCount: data?.length ?? 0 },
    });
    return data ?? [];
  });

export const issueCommercialInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => invoiceInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: result, error } = await admin.rpc("commercial_create_invoice_from_subscription", {
      _subscription_id: data.subscriptionId,
      _period_start: data.periodStart,
      _period_end: data.periodEnd,
      _due_at: data.dueAt,
      _idempotency_key: data.idempotencyKey,
      _tax_snapshot: data.taxSnapshot,
      _discount_snapshot: data.discountSnapshot,
      _actor_user_id: actor.userId,
    });
    if (error) throw new Error("Invoice issuance failed; no financial confirmation was returned.");
    await writeFinancialAudit(admin, {
      requestId: data.idempotencyKey, actorUserId: actor.userId,
      organisationId: actor.organisationId, actorRole: "founder_admin",
      action: "invoice.issue_requested", resourceType: "invoice",
      resourceRef: String(result?.invoiceId ?? data.subscriptionId),
      metadata: { replayed: result?.replayed === true },
    });
    let notificationStatus: string = "not_requested";
    if (result?.invoiceId && result?.replayed !== true) {
      try {
        const { sendCommercialInvoiceIssuedEmail } = await import("./commercial-financial-notifications.server");
        const notification = await sendCommercialInvoiceIssuedEmail({ admin, invoiceId: result.invoiceId });
        notificationStatus = notification.status;
      } catch {
        notificationStatus = "failed";
      }
    }
    return { ...result, notificationStatus };
  });

export const createMyCommercialPaymentAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => paymentInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data: invoice, error: invoiceError } = await admin.from("commercial_invoices")
      .select("id, organisation_id, currency, total_minor, amount_paid_minor, status")
      .eq("id", data.invoiceId).eq("organisation_id", actor.organisationId).maybeSingle();
    if (invoiceError || !invoice) throw new Error("Invoice not found in the active tenant.");
    if (invoice.currency !== data.currency) throw new Error("Payment currency must match the invoice currency.");
    const { data: paymentId, error } = await admin.rpc("commercial_create_payment_attempt", {
      _invoice_id: data.invoiceId, _provider_account_id: data.providerAccountId,
      _amount_minor: data.amountMinor, _currency: data.currency,
      _idempotency_key: data.idempotencyKey, _actor_user_id: actor.userId,
    });
    if (error || !paymentId) throw new Error("Payment attempt could not be created.");
    return { paymentId, status: "pending" as const };
  });

export const recordVerifiedManualCommercialPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => manualConfirmInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: payment, error: paymentError } = await admin.from("commercial_payment_transactions")
      .select("id, provider, organisation_id, amount_minor, currency, status")
      .eq("id", data.paymentId).maybeSingle();
    if (paymentError || !payment || !["manual", "bank_transfer"].includes(payment.provider)) {
      throw new Error("Only a manual or bank-transfer payment can be verified through this operation.");
    }
    if (BigInt(payment.amount_minor) !== BigInt(data.amountMinor) || payment.currency !== data.currency) {
      throw new Error("Verified bank evidence must exactly match the recorded payment amount and currency.");
    }
    const { data: result, error } = await admin.rpc("commercial_confirm_and_allocate_payment", {
      _payment_id: data.paymentId, _provider_transaction_ref: data.receiptReference,
      _verified_amount_minor: data.amountMinor, _currency: data.currency,
      _verification_source: payment.provider === "bank_transfer" ? "bank_statement_reconciliation" : "authorized_manual_verification",
      _settlement_ref: data.evidenceReference, _idempotency_key: data.idempotencyKey,
      _verified_at: new Date().toISOString(),
    });
    if (error) throw new Error("Manual payment verification failed.");
    await writeFinancialAudit(admin, {
      requestId: data.idempotencyKey, actorUserId: actor.userId,
      organisationId: payment.organisation_id, actorRole: "founder_admin",
      action: "payment.manual_verified", resourceType: "payment",
      resourceRef: data.paymentId, metadata: { evidenceReference: data.evidenceReference },
    });
    let notificationStatus = "not_requested";
    try {
      const { sendCommercialPaymentConfirmationEmail } = await import("./commercial-financial-notifications.server");
      const notification = await sendCommercialPaymentConfirmationEmail({ admin, paymentId: data.paymentId });
      notificationStatus = notification.status;
    } catch { notificationStatus = "failed"; }
    return { ...result, notificationStatus };
  });

export const reverseCommercialPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reversalInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: result, error } = await admin.rpc("commercial_record_payment_reversal", {
      _payment_id: data.paymentId, _provider_reversal_ref: data.reversalReference,
      _amount_minor: data.amountMinor, _currency: data.currency,
      _reason_code: data.reasonCode, _idempotency_key: data.idempotencyKey,
      _verified_at: new Date().toISOString(), _actor_user_id: actor.userId,
    });
    if (error) throw new Error("Payment reversal could not be recorded.");
    await writeFinancialAudit(admin, {
      requestId: data.idempotencyKey, actorUserId: actor.userId,
      organisationId: actor.organisationId, actorRole: "founder_admin",
      action: "payment.reversal_recorded", resourceType: "payment",
      resourceRef: data.paymentId, metadata: { reversalReference: data.reversalReference },
    });
    return { reversalId: result };
  });

const pesapalInitiationInput = z.object({
  paymentId: z.string().uuid(),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).nullable().optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
});

export const initiateMyCommercialPesapalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => pesapalInitiationInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data: payment, error } = await admin.from("commercial_payment_transactions")
      .select("id,organisation_id,provider_account_id,provider,amount_minor,currency,status,provider_order_ref,provider_redirect_url")
      .eq("id", data.paymentId).eq("organisation_id", actor.organisationId).maybeSingle();
    if (error || !payment || payment.provider !== "pesapal" || payment.status !== "pending") {
      throw new Error("Pending tenant Pesapal payment attempt was not found.");
    }
    if (payment.provider_order_ref && payment.provider_redirect_url) {
      return { paymentId: payment.id, redirectUrl: payment.provider_redirect_url, provider: "pesapal" as const, replayed: true };
    }
    const { data: providerAccount, error: providerError } = await admin.from("commercial_provider_accounts")
      .select("id,credential_secret_ref,status")
      .eq("id", payment.provider_account_id).eq("organisation_id", actor.organisationId)
      .eq("provider", "pesapal").maybeSingle();
    if (providerError || !providerAccount || providerAccount.status !== "active") {
      throw new Error("Active tenant Pesapal configuration is unavailable.");
    }
    const baseUrl = process.env.PUBLIC_BASE_URL;
    if (!baseUrl) throw new Error("PUBLIC_BASE_URL is required for commercial payment callbacks.");
    const { initiateTenantPesapalOrder } = await import("./commercial-pesapal.server");
    const amountMinor = BigInt(payment.amount_minor);
    if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Payment amount exceeds safe provider transport precision.");
    const order = await initiateTenantPesapalOrder({
      providerAccountId: providerAccount.id, secretRef: providerAccount.credential_secret_ref,
      paymentId: payment.id, amountMinor: Number(amountMinor), currency: payment.currency,
      email: data.email, phone: data.phone, firstName: data.firstName, lastName: data.lastName,
      callbackUrl: `${baseUrl.replace(/\/$/, "")}/api/public/commercial-pesapal/ipn`,
    });
    const { error: updateError } = await admin.from("commercial_payment_transactions").update({
      provider_order_ref: order.orderTrackingId, provider_redirect_url: order.redirectUrl,
      payment_method: "pesapal", updated_at: new Date().toISOString(),
    }).eq("id", payment.id).eq("status", "pending");
    if (updateError) throw new Error("Pesapal order reference could not be persisted.");
    return { paymentId: payment.id, redirectUrl: order.redirectUrl, provider: "pesapal" as const, replayed: false };
  });

const providerAccountInput = z.object({
  organisationId: z.string().uuid(),
  provider: z.enum(["pesapal","bank_transfer","manual"]),
  providerAccountRef: z.string().trim().min(2).max(200),
  credentialSecretRef: z.string().uuid().optional(),
  supportedCurrencies: z.array(z.enum(["TZS","USD"])).min(1).max(2),
});

export const configureCommercialProviderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => providerAccountInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: account, error } = await admin.from("commercial_accounts")
      .select("id,organisation_id").eq("organisation_id", data.organisationId).maybeSingle();
    if (error || !account) throw new Error("Target commercial account was not found.");
    if (!["bank_transfer","manual"].includes(data.provider) && !data.credentialSecretRef) {
      throw new Error("This provider requires a server-side secret reference.");
    }
    const { data: provider, error: providerError } = await admin.from("commercial_provider_accounts")
      .insert({
        organisation_id: data.organisationId, provider: data.provider,
        provider_account_ref: data.providerAccountRef,
        credential_secret_ref: data.credentialSecretRef ?? null,
        supported_currencies: [...new Set(data.supportedCurrencies)], status: "inactive",
      }).select("id,organisation_id,provider,provider_account_ref,supported_currencies,status").single();
    if (providerError || !provider) throw new Error("Provider account configuration could not be persisted.");
    await writeFinancialAudit(admin, {
      requestId: globalThis.crypto.randomUUID(), actorUserId: actor.userId,
      organisationId: data.organisationId, actorRole: "founder_admin",
      action: "provider_account.configured", resourceType: "provider_account",
      resourceRef: provider.id, metadata: { provider: data.provider, status: "inactive" },
    });
    return provider;
  });

export const recordCommercialInvoiceAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    invoiceId: z.string().uuid(), adjustmentRef: z.string().trim().min(4).max(200),
    adjustmentType: z.enum(["credit_note","debit_note","write_off"]),
    amountMinor: z.number().int().positive().safe(), currency: z.enum(["TZS","USD"]),
    reasonCode: z.string().trim().min(2).max(120), approvalRef: z.string().trim().min(4).max(200),
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const admin = await getAdmin();
    const { data: invoice, error: invoiceError } = await admin.from("commercial_invoices")
      .select("id,organisation_id,currency").eq("id", data.invoiceId).maybeSingle();
    if (invoiceError || !invoice || invoice.currency !== data.currency) throw new Error("Invoice/currency scope mismatch.");
    const { data: result, error } = await admin.rpc("commercial_post_invoice_adjustment", {
      _invoice_id: data.invoiceId, _adjustment_ref: data.adjustmentRef,
      _adjustment_type: data.adjustmentType, _amount_minor: data.amountMinor,
      _currency: data.currency, _reason_code: data.reasonCode,
      _approval_ref: data.approvalRef, _actor_user_id: actor.userId,
    });
    if (error) throw new Error("Invoice adjustment could not be posted.");
    return { adjustmentId: result };
  });

export const getMyCommercialInvoiceDocumentData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data: invoice, error } = await admin.from("commercial_invoices").select("*")
      .eq("id", data.invoiceId).eq("organisation_id", actor.organisationId).maybeSingle();
    if (error || !invoice || !invoice.issued_at || invoice.status==="draft") throw new Error("Issued invoice not found in the active tenant.");
    const [lines, payments, allocations, adjustments] = await Promise.all([
      admin.from("commercial_invoice_lines").select("*").eq("invoice_id", invoice.id).order("created_at"),
      admin.from("commercial_payment_transactions").select("id,provider,provider_transaction_ref,amount_minor,currency,status,initiated_at,confirmed_at")
        .eq("invoice_id", invoice.id).order("created_at"),
      admin.from("commercial_payment_allocations").select("*").eq("invoice_id", invoice.id).order("allocated_at"),
      admin.from("commercial_invoice_adjustments").select("*").eq("invoice_id", invoice.id).order("created_at"),
    ]);
    if (lines.error || payments.error || allocations.error || adjustments.error) throw new Error("Financial document records could not be loaded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"invoice.document_viewed",
      resourceType:"invoice",resourceRef:invoice.id,metadata:{documentType:"record"}});
    return { invoice, lines: lines.data ?? [], payments: payments.data ?? [], allocations: allocations.data ?? [], adjustments: adjustments.data ?? [] };
  });

export const listMyCommercialPaymentHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data, error } = await admin.from("commercial_payment_transactions")
      .select("id,invoice_id,provider,provider_transaction_ref,amount_minor,currency,payment_method,status,initiated_at,confirmed_at")
      .eq("organisation_id", actor.organisationId).order("created_at", { ascending: false });
    if (error) throw new Error("Unable to load tenant payment history.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"payment.tenant_history_viewed",
      resourceType:"payment_index",resourceRef:actor.organisationId,metadata:{rowCount:data?.length??0}});
    return data ?? [];
  });

export const generateMyCommercialInvoicePdf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ invoiceId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data: invoice, error } = await admin.from("commercial_invoices").select("*")
      .eq("id",data.invoiceId).eq("organisation_id",actor.organisationId).maybeSingle();
    if (error || !invoice || !invoice.issued_at || invoice.status === "draft") {
      throw new Error("An issued invoice document was not found in the active tenant.");
    }
    const [lines, adjustments] = await Promise.all([
      admin.from("commercial_invoice_lines").select("*").eq("invoice_id",invoice.id).order("created_at"),
      admin.from("commercial_invoice_adjustments").select("*").eq("invoice_id",invoice.id).order("created_at"),
    ]);
    if (lines.error || adjustments.error) throw new Error("Invoice document records could not be loaded.");
    const { buildCommercialInvoicePdf } = await import("./commercial-invoice-document.server");
    const bytes = await buildCommercialInvoicePdf({
      invoice, lines: lines.data ?? [], adjustments: adjustments.data ?? [],
    });
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"invoice.document_downloaded",
      resourceType:"invoice",resourceRef:invoice.id,metadata:{documentType:"pdf"}});
    return { fileName: `${invoice.invoice_number}.pdf`, bytes: Array.from(bytes) };
  });

export const generateMyCommercialPaymentReceiptPdf = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedTenantActor(context);
    if (actor.actorRole !== "tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin = await getAdmin();
    const { data: payment, error } = await admin.from("commercial_payment_transactions").select("*")
      .eq("id",data.paymentId).eq("organisation_id",actor.organisationId).maybeSingle();
    if (error || !payment || !["successful","partially_reversed","reversed"].includes(payment.status)) {
      throw new Error("A verified tenant payment receipt was not found.");
    }
    const {data:allocation,error:allocationError}=await admin.from("commercial_payment_allocations")
      .select("settlement_ref,amount_minor,allocated_at,invoice_id").eq("payment_id",payment.id).maybeSingle();
    if(allocationError) throw new Error("Persisted payment allocation could not be loaded.");
    if(payment.invoice_id===null){
      const {data:invoice}=allocation?.invoice_id
        ? await admin.from("commercial_invoices").select("invoice_number,currency").eq("id",allocation.invoice_id).eq("organisation_id",actor.organisationId).maybeSingle()
        : {data:null};
      const {data:unallocated}=await admin.from("commercial_unallocated_collections").select("unallocated_minor").eq("payment_id",payment.id).maybeSingle();
      const {buildCommercialUnallocatedReceiptPdf}=await import("./commercial-invoice-document.server");
      const bytes=await buildCommercialUnallocatedReceiptPdf({
        payment,allocation:allocation?{...allocation,invoice_number:invoice?.invoice_number??null}:null,
        unallocatedMinor:unallocated?.unallocated_minor??(allocation||payment.status==="reversed"?0:payment.amount_minor),
      });
      await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
        organisationId:actor.organisationId,actorRole:actor.actorRole,action:"payment.receipt_downloaded",
        resourceType:"payment",resourceRef:payment.id,metadata:{documentType:"pdf",unallocated:true}});
      return {fileName:`receipt-${allocation?.settlement_ref??payment.id}.pdf`,bytes:Array.from(bytes)};
    }
    const {data:invoice,error:invoiceError}=await admin.from("commercial_invoices").select("invoice_number,currency")
      .eq("id",payment.invoice_id).eq("organisation_id",actor.organisationId).maybeSingle();
    if(invoiceError||!invoice||!allocation) throw new Error("Persisted receipt evidence is incomplete.");
    const {buildCommercialPaymentReceiptPdf}=await import("./commercial-invoice-document.server");
    const bytes=await buildCommercialPaymentReceiptPdf({payment,invoice,allocation});
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"payment.receipt_downloaded",
      resourceType:"payment",resourceRef:payment.id,metadata:{documentType:"pdf",unallocated:false}});
    return {fileName:`receipt-${allocation.settlement_ref}.pdf`,bytes:Array.from(bytes)};
  });

const reconciliationRunInput = z.object({
  providerAccountId: z.string().uuid(), currency: z.enum(["TZS","USD"]),
  periodStart: z.string().datetime({offset:true}), periodEnd: z.string().datetime({offset:true}),
  sourceRef: z.string().trim().min(3).max(200),
});
export const createCommercialReconciliationRun = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>reconciliationRunInput.parse(input))
  .handler(async ({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:provider,error:providerError}=await admin.from("commercial_provider_accounts")
      .select("id,organisation_id,supported_currencies").eq("id",data.providerAccountId).maybeSingle();
    if(providerError||!provider||!provider.supported_currencies.includes(data.currency)) throw new Error("Provider account/currency is not configured.");
    const {data:run,error}=await admin.from("commercial_reconciliation_runs").insert({
      organisation_id:provider.organisation_id,provider_account_id:provider.id,currency:data.currency,
      period_start:data.periodStart,period_end:data.periodEnd,source_ref:data.sourceRef,started_by:actor.userId,
    }).select("id,status").single();
    if(error||!run) throw new Error("Reconciliation run could not be created.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:provider.organisation_id,actorRole:"founder_admin",action:"reconciliation.started",
      resourceType:"reconciliation_run",resourceRef:run.id,metadata:{currency:data.currency,sourceRef:data.sourceRef}});
    return run;
  });

const reconciliationItemInput=z.object({
  runId:z.string().uuid(),
  itemType:z.enum(["matched","missing_internal","missing_provider","duplicate","amount_mismatch","currency_mismatch","status_mismatch","unallocated","reversed"]),
  internalPaymentId:z.string().uuid().nullable().optional(),
  providerRef:z.string().trim().max(200).nullable().optional(),
  expectedAmountMinor:z.number().int().nonnegative().safe().nullable().optional(),
  observedAmountMinor:z.number().int().nonnegative().safe().nullable().optional(),
  expectedCurrency:z.enum(["TZS","USD"]).nullable().optional(),
  observedCurrency:z.enum(["TZS","USD"]).nullable().optional(),
  evidence:z.record(z.string(),z.unknown()).default({}),
});
export const addCommercialReconciliationItem=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>reconciliationItemInput.parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:run,error:runError}=await admin.from("commercial_reconciliation_runs")
      .select("id,organisation_id,status").eq("id",data.runId).maybeSingle();
    if(runError||!run||run.status!=="open") throw new Error("Open reconciliation run was not found.");
    const {data:item,error}=await admin.from("commercial_reconciliation_items").insert({
      run_id:data.runId,item_type:data.itemType,internal_payment_id:data.internalPaymentId??null,
      provider_ref:data.providerRef??null,expected_amount_minor:data.expectedAmountMinor??null,
      observed_amount_minor:data.observedAmountMinor??null,expected_currency:data.expectedCurrency??null,
      observed_currency:data.observedCurrency??null,evidence:data.evidence,
    }).select("id,item_type,resolution_status").single();
    if(error||!item) throw new Error("Reconciliation evidence could not be recorded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:run.organisation_id,actorRole:"founder_admin",action:"reconciliation.item_recorded",
      resourceType:"reconciliation_item",resourceRef:item.id,metadata:{itemType:item.item_type}});
    return item;
  });

export const resolveCommercialReconciliationItem=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({itemId:z.string().uuid(),resolutionRef:z.string().trim().min(3).max(200)}).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:item,error}=await admin.from("commercial_reconciliation_items").select("id,run_id,resolution_status").eq("id",data.itemId).maybeSingle();
    if(error||!item) throw new Error("Reconciliation item not found.");
    const {data:run}=await admin.from("commercial_reconciliation_runs").select("organisation_id,status").eq("id",item.run_id).maybeSingle();
    if(!run||run.status==="completed") throw new Error("Completed reconciliation evidence cannot be changed.");
    const {error:updateError}=await admin.from("commercial_reconciliation_items").update({
      resolution_status:"resolved",resolution_ref:data.resolutionRef,
    }).eq("id",data.itemId);
    if(updateError) throw new Error("Reconciliation resolution could not be recorded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:run?.organisation_id??actor.organisationId,actorRole:"founder_admin",
      action:"reconciliation.item_resolved",resourceType:"reconciliation_item",resourceRef:data.itemId,
      metadata:{resolutionRef:data.resolutionRef}});
    return {itemId:data.itemId,resolutionStatus:"resolved" as const};
  });

export const completeCommercialReconciliationRun=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({runId:z.string().uuid()}).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:run,error}=await admin.from("commercial_reconciliation_runs").select("id,organisation_id,status")
      .eq("id",data.runId).maybeSingle();
    if(error||!run||run.status==="completed") throw new Error("Open reconciliation run was not found.");
    const {count,error:countError}=await admin.from("commercial_reconciliation_items")
      .select("id",{count:"exact",head:true}).eq("run_id",data.runId).neq("resolution_status","resolved");
    if(countError) throw new Error("Unresolved reconciliation items could not be counted.");
    const status=(count??0)>0?"discrepancy":"completed";
    const {error:updateError}=await admin.from("commercial_reconciliation_runs").update({
      status,completed_at:new Date().toISOString(),
    }).eq("id",data.runId);
    if(updateError) throw new Error("Reconciliation run could not be completed.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:run.organisation_id,actorRole:"founder_admin",action:"reconciliation.completed",
      resourceType:"reconciliation_run",resourceRef:data.runId,metadata:{status,unresolvedItems:count??0}});
    return {runId:data.runId,status};
  });

export const setCommercialProviderAccountStatus=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    providerAccountId:z.string().uuid(),status:z.enum(["inactive","active","suspended"]),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:provider,error}=await admin.from("commercial_provider_accounts")
      .select("id,organisation_id,provider,status,credential_secret_ref")
      .eq("id",data.providerAccountId).maybeSingle();
    if(error||!provider) throw new Error("Commercial provider account was not found.");
    if(data.status==="active" && !["bank_transfer","manual"].includes(provider.provider) && !provider.credential_secret_ref) throw new Error("A server-side provider secret reference is required before activation.");
    const {error:updateError}=await admin.from("commercial_provider_accounts")
      .update({status:data.status,updated_at:new Date().toISOString()}).eq("id",provider.id);
    if(updateError) throw new Error("Provider account status could not be changed.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:provider.organisation_id,actorRole:"founder_admin",action:"provider_account.status_changed",
      resourceType:"provider_account",resourceRef:provider.id,metadata:{provider:provider.provider,from:provider.status,to:data.status}});
    return {providerAccountId:provider.id,status:data.status};
  });

export const refreshOverdueCommercialInvoices=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:count,error}=await admin.rpc("commercial_refresh_overdue_invoices");
    if(error) throw new Error("Overdue invoice refresh failed.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"invoice.overdue_refresh",
      resourceType:"invoice_collection",resourceRef:"platform",metadata:{updatedCount:count}});
    return {updatedCount:count};
  });

export const issueNextSubscriptionInvoice=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    subscriptionId:z.string().uuid(),dueAt:z.string().datetime({offset:true}),
    idempotencyKey:z.string().trim().min(8).max(200),
    taxSnapshot:z.record(z.string(),z.unknown()),
    discountSnapshot:z.record(z.string(),z.unknown()).default({amountMinor:0,policyRef:"none"}),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:subscription,error}=await admin.from("commercial_subscriptions")
      .select("id,status,billing_term,current_period_ends_at,account_id")
      .eq("id",data.subscriptionId).maybeSingle();
    if(error||!subscription||subscription.status!=="active"||!subscription.current_period_ends_at) {
      throw new Error("Active subscription with a current billing period is required.");
    }
    const {nextCommercialBillingPeriod}=await import("./commercial-billing-engine");
    const period=nextCommercialBillingPeriod(subscription.current_period_ends_at,subscription.billing_term);
    const {data:result,error:invoiceError}=await admin.rpc("commercial_create_invoice_from_subscription",{
      _subscription_id:data.subscriptionId,_period_start:period.startsAt,_period_end:period.endsAt,
      _due_at:data.dueAt,_idempotency_key:data.idempotencyKey,_tax_snapshot:data.taxSnapshot,
      _discount_snapshot:data.discountSnapshot,_actor_user_id:actor.userId,
    });
    if(invoiceError) throw new Error("Recurring subscription invoice generation failed.");
    if(result?.invoiceId && result?.replayed!==true) {
      try {
        const {sendCommercialInvoiceIssuedEmail}=await import("./commercial-financial-notifications.server");
        await sendCommercialInvoiceIssuedEmail({admin,invoiceId:result.invoiceId});
      } catch { /* Invoice remains issued; outbox status captures delivery failure. */ }
    }
    return {...result,billingPeriod:period};
  });

export const dispatchCommercialInvoiceReminders=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    notificationType:z.enum(["upcoming_due","overdue_notice"]),
    dueFrom:z.string().datetime({offset:true}).optional(),
    dueTo:z.string().datetime({offset:true}).optional(),
  }).refine(value=>value.notificationType!=="upcoming_due" || (value.dueFrom && value.dueTo && value.dueTo>value.dueFrom),
    {message:"Upcoming reminders require an explicit due-date window."}).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    let query=admin.from("commercial_invoice_receivables").select("id,organisation_id,invoice_number,due_at,outstanding_minor")
      .gt("outstanding_minor",0);
    if(data.notificationType==="upcoming_due") query=query.gte("due_at",data.dueFrom).lte("due_at",data.dueTo);
    else query=query.lt("due_at",new Date().toISOString());
    const {data:invoices,error}=await query;
    if(error) throw new Error("Open receivables for reminder dispatch could not be loaded.");
    const {sendCommercialInvoiceReminderEmail}=await import("./commercial-financial-notifications.server");
    const results=[];
    for(const invoice of invoices??[]){
      try{
        const result=await sendCommercialInvoiceReminderEmail({admin,invoiceId:invoice.id,notificationType:data.notificationType});
        results.push({invoiceId:invoice.id,status:result.status});
      }catch{
        results.push({invoiceId:invoice.id,status:"failed"});
      }
    }
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"invoice.reminders_dispatched",
      resourceType:"invoice_notification_batch",resourceRef:globalThis.crypto.randomUUID(),
      metadata:{notificationType:data.notificationType,processed:results.length,failed:results.filter(x=>x.status==="failed").length}});
    return results;
  });

export const recordUnallocatedCommercialPayment=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    accountId:z.string().uuid(),providerAccountId:z.string().uuid(),
    amountMinor:z.number().int().positive().safe(),currency:z.enum(["TZS","USD"]),
    idempotencyKey:z.string().trim().min(8).max(200),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:paymentId,error}=await admin.rpc("commercial_record_unallocated_payment",{
      _account_id:data.accountId,_provider_account_id:data.providerAccountId,
      _amount_minor:data.amountMinor,_currency:data.currency,
      _idempotency_key:data.idempotencyKey,_actor_user_id:actor.userId,
    });
    if(error||!paymentId) throw new Error("Unallocated collection could not be recorded.");
    return {paymentId,status:"pending" as const,unallocated:true};
  });

export const confirmUnallocatedCommercialPayment=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    paymentId:z.string().uuid(),providerTransactionRef:z.string().trim().min(2).max(200),
    amountMinor:z.number().int().positive().safe(),currency:z.enum(["TZS","USD"]),
    verificationSource:z.enum(["authorized_manual_verification","bank_statement_reconciliation"]),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:payment,error:paymentError}=await admin.from("commercial_payment_transactions")
      .select("id,provider,organisation_id,amount_minor,currency,invoice_id")
      .eq("id",data.paymentId).maybeSingle();
    if(paymentError||!payment||payment.invoice_id!==null||!["manual","bank_transfer"].includes(payment.provider)
      ||BigInt(payment.amount_minor)!==BigInt(data.amountMinor)||payment.currency!==data.currency) {
      throw new Error("Unallocated manual/bank payment does not match the recorded tenant collection.");
    }
    const {data:replayed,error}=await admin.rpc("commercial_confirm_unallocated_payment",{
      _payment_id:data.paymentId,_provider_transaction_ref:data.providerTransactionRef,
      _verified_amount_minor:data.amountMinor,_currency:data.currency,
      _verification_source:data.verificationSource,_verified_at:new Date().toISOString(),
    });
    if(error) throw new Error("Unallocated collection verification failed.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:payment.organisation_id,actorRole:"founder_admin",action:"payment.unallocated_verified",
      resourceType:"payment",resourceRef:data.paymentId,metadata:{providerTransactionRef:data.providerTransactionRef,replayed}});
    let notificationStatus="not_requested";
    try{
      const {sendCommercialUnallocatedPaymentEmail}=await import("./commercial-financial-notifications.server");
      const notification=await sendCommercialUnallocatedPaymentEmail({admin,paymentId:data.paymentId});
      notificationStatus=notification.status;
    }catch{notificationStatus="failed";}
    return {paymentId:data.paymentId,status:"successful" as const,replayed,notificationStatus};
  });

export const allocateUnallocatedCommercialPayment=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    paymentId:z.string().uuid(),invoiceId:z.string().uuid(),amountMinor:z.number().int().positive().safe(),
    settlementRef:z.string().trim().min(1).max(200),idempotencyKey:z.string().trim().min(8).max(200),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:allocationId,error}=await admin.rpc("commercial_allocate_unallocated_payment",{
      _payment_id:data.paymentId,_invoice_id:data.invoiceId,_amount_minor:data.amountMinor,
      _settlement_ref:data.settlementRef,_idempotency_key:data.idempotencyKey,_actor_user_id:actor.userId,
    });
    if(error||!allocationId) throw new Error("Unallocated collection could not be applied to the invoice.");
    return {allocationId};
  });

export const listUnallocatedCommercialCollections=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data,error}=await admin.from("commercial_unallocated_collections").select("*")
      .order("confirmed_at",{ascending:false});
    if(error) throw new Error("Unallocated collections could not be loaded.");
    return data??[];
  });

export const generateMyCommercialUnallocatedReceiptPdf=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({paymentId:z.string().uuid()}).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedTenantActor(context);
    if(actor.actorRole!=="tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin=await getAdmin();
    const {data:payment,error}=await admin.from("commercial_payment_transactions").select("*")
      .eq("id",data.paymentId).eq("organisation_id",actor.organisationId).is("invoice_id",null)
      .in("status",["successful","partially_reversed","reversed"]).maybeSingle();
    if(error||!payment) throw new Error("Verified unallocated tenant collection was not found.");
    const [allocation,unallocated]=await Promise.all([
      admin.from("commercial_payment_allocations").select("settlement_ref,amount_minor,allocated_at,invoice_id")
        .eq("payment_id",payment.id).maybeSingle(),
      admin.from("commercial_unallocated_collections").select("unallocated_minor").eq("payment_id",payment.id).maybeSingle(),
    ]);
    if(allocation.error||unallocated.error) throw new Error("Unallocated collection allocation evidence could not be loaded.");
    const {data:invoice}=allocation.data?.invoice_id
      ? await admin.from("commercial_invoices").select("invoice_number").eq("id",allocation.data.invoice_id)
        .eq("organisation_id",actor.organisationId).maybeSingle()
      : {data:null};
    const {buildCommercialUnallocatedReceiptPdf}=await import("./commercial-invoice-document.server");
    const bytes=await buildCommercialUnallocatedReceiptPdf({
      payment,allocation:allocation.data?{...allocation.data,invoice_number:invoice?.invoice_number??null}:null,
      unallocatedMinor:unallocated.data?.unallocated_minor??(allocation.data||payment.status==="reversed"?0:payment.amount_minor),
    });
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"payment.receipt_downloaded",
      resourceType:"payment",resourceRef:payment.id,metadata:{documentType:"pdf",unallocated:true}});
    return {fileName:`receipt-unallocated-${payment.id}.pdf`,bytes:Array.from(bytes)};
  });

export const voidCommercialInvoice=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    invoiceId:z.string().uuid(),reasonCode:z.string().trim().min(2).max(120),
    approvalRef:z.string().trim().min(4).max(200),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:result,error}=await admin.rpc("commercial_void_invoice",{
      _invoice_id:data.invoiceId,_reason_code:data.reasonCode,
      _approval_ref:data.approvalRef,_actor_user_id:actor.userId,
    });
    if(error||result!==true) throw new Error("Invoice voiding was not confirmed.");
    return {invoiceId:data.invoiceId,status:"void" as const};
  });

const founderFinancialFilters=z.object({
  organisationId:z.string().uuid().optional(),subscriptionId:z.string().uuid().optional(),
  currency:z.enum(["TZS","USD"]).optional(),
  status:z.enum(["draft","issued","partially_paid","paid","overdue","void"]).optional(),
  periodFrom:z.string().datetime({offset:true}).optional(),periodTo:z.string().datetime({offset:true}).optional(),
  provider:z.enum(["pesapal","bank_transfer","manual"]).optional(),
});
export const filterCommercialInvoicesForFounder=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>founderFinancialFilters.parse(input??{}))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    let query=admin.from("commercial_invoice_receivables").select("*").order("issued_at",{ascending:false});
    if(data.organisationId) query=query.eq("organisation_id",data.organisationId);
    if(data.subscriptionId) query=query.eq("subscription_id",data.subscriptionId);
    if(data.currency) query=query.eq("currency",data.currency);
    if(data.status) query=query.eq("status",data.status);
    if(data.periodFrom) query=query.gte("billing_period_start",data.periodFrom);
    if(data.periodTo) query=query.lte("billing_period_end",data.periodTo);
    const {data:rows,error}=await query;
    if(error) throw new Error("Filtered commercial invoices could not be loaded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"invoice.filtered_list_viewed",
      resourceType:"invoice_index",resourceRef:"platform",metadata:{filters:data,rowCount:rows?.length??0}});
    return rows??[];
  });

export const listCommercialPaymentsForFounder=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    organisationId:z.string().uuid().optional(),currency:z.enum(["TZS","USD"]).optional(),
    provider:z.enum(["pesapal","airtel_money","mixx_by_yas","mpesa","halopesa","bank_transfer","manual"]).optional(),
    status:z.enum(["pending","successful","failed","cancelled","partially_reversed","reversed"]).optional(),
    subscriptionId:z.string().uuid().optional(),periodFrom:z.string().datetime({offset:true}).optional(),
    periodTo:z.string().datetime({offset:true}).optional(),
  }).parse(input??{}))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    let invoiceIds:string[]|null=null;
    if(data.subscriptionId||data.periodFrom||data.periodTo){
      let invoiceQuery=admin.from("commercial_invoices").select("id");
      if(data.organisationId) invoiceQuery=invoiceQuery.eq("organisation_id",data.organisationId);
      if(data.subscriptionId) invoiceQuery=invoiceQuery.eq("subscription_id",data.subscriptionId);
      if(data.periodFrom) invoiceQuery=invoiceQuery.gte("billing_period_start",data.periodFrom);
      if(data.periodTo) invoiceQuery=invoiceQuery.lte("billing_period_end",data.periodTo);
      const {data:invoiceRows,error:invoiceError}=await invoiceQuery;
      if(invoiceError) throw new Error("Payment invoice filters could not be resolved.");
      invoiceIds=(invoiceRows??[]).map((row:{id:string})=>row.id);
      if(!invoiceIds || invoiceIds.length===0) return [];
    }
    let query=admin.from("commercial_payment_transactions").select("*").order("created_at",{ascending:false});
    if(data.organisationId) query=query.eq("organisation_id",data.organisationId);
    if(data.currency) query=query.eq("currency",data.currency);
    if(data.provider) query=query.eq("provider",data.provider);
    if(data.status) query=query.eq("status",data.status);
    if(invoiceIds) query=query.in("invoice_id",invoiceIds);
    const {data:rows,error}=await query;
    if(error) throw new Error("Commercial payment ledger could not be loaded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"payment.filtered_list_viewed",
      resourceType:"payment_index",resourceRef:"platform",metadata:{filters:data,rowCount:rows?.length??0}});
    return rows??[];
  });

export const getCommercialReceivablesSummary=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const [invoices,unallocated,adjustments]=await Promise.all([
      admin.from("commercial_invoice_receivables").select("currency,total_minor,amount_paid_minor,outstanding_minor,credit_balance_minor,is_overdue,status")
        .in("status",["issued","partially_paid","paid","overdue"]),
      admin.from("commercial_unallocated_collections").select("currency,unallocated_minor"),
      admin.from("commercial_invoice_adjustments").select("currency,adjustment_type,amount_minor").eq("status","posted"),
    ]);
    if(invoices.error||unallocated.error||adjustments.error) throw new Error("Commercial receivables summary could not be calculated.");
    const summary:Record<string,{invoicedMinor:string;collectedMinor:string;outstandingMinor:string;overdueMinor:string;creditBalanceMinor:string;unallocatedMinor:string;creditMinor:string;debitMinor:string;writeOffMinor:string;invoiceCount:number;partiallyPaidCount:number}>={};
    for(const currency of ["TZS","USD"]){
      summary[currency]={invoicedMinor:"0",collectedMinor:"0",outstandingMinor:"0",overdueMinor:"0",creditBalanceMinor:"0",unallocatedMinor:"0",creditMinor:"0",debitMinor:"0",writeOffMinor:"0",invoiceCount:0,partiallyPaidCount:0};
    }
    for(const row of invoices.data??[]){
      const target=summary[row.currency]; if(!target) continue;
      target.invoicedMinor=(BigInt(target.invoicedMinor)+BigInt(row.total_minor)).toString();
      target.collectedMinor=(BigInt(target.collectedMinor)+BigInt(row.amount_paid_minor)).toString();
      target.outstandingMinor=(BigInt(target.outstandingMinor)+BigInt(row.outstanding_minor)).toString();
      target.creditBalanceMinor=(BigInt(target.creditBalanceMinor)+BigInt(row.credit_balance_minor)).toString();
      if(row.is_overdue) target.overdueMinor=(BigInt(target.overdueMinor)+BigInt(row.outstanding_minor)).toString();
      target.invoiceCount+=1;
      if(row.status==="partially_paid") target.partiallyPaidCount+=1;
    }
    for(const row of unallocated.data??[]){
      const target=summary[row.currency]; if(target) target.unallocatedMinor=(BigInt(target.unallocatedMinor)+BigInt(row.unallocated_minor)).toString();
    }
    for(const row of adjustments.data??[]){
      const target=summary[row.currency]; if(!target) continue;
      if(row.adjustment_type==="credit_note") target.creditMinor=(BigInt(target.creditMinor)+BigInt(row.amount_minor)).toString();
      if(row.adjustment_type==="debit_note") target.debitMinor=(BigInt(target.debitMinor)+BigInt(row.amount_minor)).toString();
      if(row.adjustment_type==="write_off") target.writeOffMinor=(BigInt(target.writeOffMinor)+BigInt(row.amount_minor)).toString();
    }
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"receivables.summary_viewed",
      resourceType:"receivables_summary",resourceRef:"platform",metadata:{currencies:["TZS","USD"]}});
    return summary;
  });

export const createCommercialInvoiceDraft=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    subscriptionId:z.string().uuid(),periodStart:z.string().datetime({offset:true}),
    periodEnd:z.string().datetime({offset:true}),idempotencyKey:z.string().trim().min(8).max(200),
    taxSnapshot:z.record(z.string(),z.unknown()),
    discountSnapshot:z.record(z.string(),z.unknown()).default({amountMinor:0,policyRef:"none"}),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:result,error}=await admin.rpc("commercial_create_invoice_draft_from_subscription",{
      _subscription_id:data.subscriptionId,_period_start:data.periodStart,_period_end:data.periodEnd,
      _idempotency_key:data.idempotencyKey,_tax_snapshot:data.taxSnapshot,
      _discount_snapshot:data.discountSnapshot,_actor_user_id:actor.userId,
    });
    if(error||!result?.invoiceId) throw new Error("Commercial invoice draft could not be created.");
    return result;
  });

export const issueCommercialInvoiceDraft=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    invoiceId:z.string().uuid(),dueAt:z.string().datetime({offset:true}),
    approvalRef:z.string().trim().min(4).max(200),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:result,error}=await admin.rpc("commercial_issue_draft_invoice",{
      _invoice_id:data.invoiceId,_due_at:data.dueAt,
      _approval_ref:data.approvalRef,_actor_user_id:actor.userId,
    });
    if(error||typeof result!=="boolean") throw new Error("Invoice draft issuance was not confirmed.");
    let notificationStatus="not_requested";
    try{
      const {sendCommercialInvoiceIssuedEmail}=await import("./commercial-financial-notifications.server");
      const notification=await sendCommercialInvoiceIssuedEmail({admin,invoiceId:data.invoiceId});
      notificationStatus=notification.status;
    }catch{notificationStatus="failed";}
    return {invoiceId:data.invoiceId,status:"issued" as const,replayed:result,notificationStatus};
  });

const providerStatementRow=z.object({
  providerRef:z.string().trim().min(1).max(200),
  amountMinor:z.number().int().nonnegative().safe(),
  currency:z.enum(["TZS","USD"]),
  status:z.enum(["successful","failed","cancelled","reversed"]),
});
export const reconcileCommercialProviderStatementRun=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    runId:z.string().uuid(),providerRows:z.array(providerStatementRow).max(1000),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:run,error:runError}=await admin.from("commercial_reconciliation_runs").select("*")
      .eq("id",data.runId).maybeSingle();
    if(runError||!run||run.status!=="open") throw new Error("Open reconciliation run was not found.");
    if(!run.provider_account_id||!run.organisation_id) throw new Error("A tenant provider account is required for automated statement matching.");
    const {data:payments,error:paymentError}=await admin.from("commercial_payment_transactions").select("*")
      .eq("organisation_id",run.organisation_id).eq("provider_account_id",run.provider_account_id)
      .eq("currency",run.currency).gte("initiated_at",run.period_start).lte("initiated_at",run.period_end);
    if(paymentError) throw new Error("Internal payments for the reconciliation period could not be loaded.");
    const paymentIds=(payments??[]).map((payment:{id:string})=>payment.id);
    const allocations=paymentIds.length
      ? await admin.from("commercial_payment_allocations").select("payment_id,amount_minor").in("payment_id",paymentIds)
      : {data:[],error:null};
    if(allocations.error) throw new Error("Payment allocations for reconciliation could not be loaded.");
    const allocatedByPayment=new Map<string,bigint>();
    for(const allocation of allocations.data??[]){
      allocatedByPayment.set(allocation.payment_id,(allocatedByPayment.get(allocation.payment_id)??0n)+BigInt(allocation.amount_minor));
    }
    const internal=(payments??[]).map((payment:{id:string;provider_transaction_ref:string|null;provider_order_ref:string|null;amount_minor:number|string;currency:"TZS"|"USD";status:"pending"|"successful"|"failed"|"cancelled"|"partially_reversed"|"reversed"})=>{
      const amountMinor=BigInt(payment.amount_minor);
      const allocatedMinor=allocatedByPayment.get(payment.id)??0n;
      if(amountMinor>BigInt(Number.MAX_SAFE_INTEGER)||allocatedMinor>BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new Error("Payment exceeds safe provider statement comparison precision; manual reconciliation is required.");
      }
      return {
        id:payment.id,providerTransactionRef:payment.provider_transaction_ref,providerOrderRef:payment.provider_order_ref,
        amountMinor:Number(amountMinor),currency:payment.currency,status:payment.status,
        allocatedMinor:Number(allocatedMinor),
      };
    });
    const {reconcileCommercialProviderStatement}=await import("./commercial-reconciliation-engine");
    const results=reconcileCommercialProviderStatement(internal,data.providerRows);
    if(results.length){
      const {error:insertError}=await admin.from("commercial_reconciliation_items").insert(results.map(item=>({
        run_id:data.runId,item_type:item.itemType,internal_payment_id:item.internalPaymentId,
        provider_ref:item.providerRef,expected_amount_minor:item.expectedAmountMinor,
        observed_amount_minor:item.observedAmountMinor,expected_currency:item.expectedCurrency,
        observed_currency:item.observedCurrency,evidence:item.evidence,
        resolution_status:item.resolutionStatus,resolution_ref:item.resolutionRef,
      })));
      if(insertError) throw new Error("Reconciliation evidence could not be persisted.");
    }
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:run.organisation_id,actorRole:"founder_admin",action:"reconciliation.statement_compared",
      resourceType:"reconciliation_run",resourceRef:data.runId,
      metadata:{providerRows:data.providerRows.length,internalPayments:internal.length,findings:results.length,
        discrepancies:results.filter(item=>item.resolutionStatus==="unresolved").length}});
    return results;
  });

export const markCommercialPaymentAttemptFailed=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    paymentId:z.string().uuid(),finalStatus:z.enum(["failed","cancelled"]),
    providerEventRef:z.string().trim().min(1).max(200),reasonCode:z.string().trim().min(2).max(120),
    idempotencyKey:z.string().trim().min(8).max(200),
  }).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const admin=await getAdmin();
    const {data:payment,error}=await admin.from("commercial_payment_transactions")
      .select("id,organisation_id,invoice_id,status").eq("id",data.paymentId).maybeSingle();
    if(error||!payment) throw new Error("Commercial payment attempt was not found.");
    const {data:replayed,error:failureError}=await admin.rpc("commercial_record_payment_failure",{
      _payment_id:data.paymentId,_provider_event_ref:data.providerEventRef,
      _final_status:data.finalStatus,_reason_code:data.reasonCode,_idempotency_key:data.idempotencyKey,
    });
    if(failureError) throw new Error("Payment failure/cancellation could not be recorded.");
    await writeFinancialAudit(admin,{requestId:data.idempotencyKey,actorUserId:actor.userId,
      organisationId:payment.organisation_id,actorRole:"founder_admin",
      action:data.finalStatus==="failed"?"payment.failed":"payment.cancelled",
      resourceType:"payment",resourceRef:data.paymentId,metadata:{providerEventRef:data.providerEventRef,replayed}});
    let notificationStatus="not_applicable";
    if(data.finalStatus==="failed" && payment.invoice_id!==null){
      try{
        const {sendCommercialPaymentFailureEmail}=await import("./commercial-financial-notifications.server");
        const notification=await sendCommercialPaymentFailureEmail({admin,paymentId:data.paymentId});
        notificationStatus=notification.status;
      }catch{notificationStatus="failed";}
    }
    return {paymentId:data.paymentId,status:data.finalStatus,replayed,notificationStatus};
  });

export const getMyCommercialFinancialPosition=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const actor=await resolveVerifiedTenantActor(context);
    if(actor.actorRole!=="tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin=await getAdmin();
    const [invoices,unallocated]=await Promise.all([
      admin.from("commercial_invoice_receivables").select("currency,total_minor,amount_paid_minor,outstanding_minor,credit_balance_minor,status")
        .eq("organisation_id",actor.organisationId).in("status",["issued","partially_paid","paid","overdue"]),
      admin.from("commercial_unallocated_collections").select("currency,unallocated_minor")
        .eq("organisation_id",actor.organisationId),
    ]);
    if(invoices.error||unallocated.error) throw new Error("Tenant financial position could not be loaded.");
    const summary:Record<string,{invoicedMinor:string;collectedMinor:string;outstandingMinor:string;creditBalanceMinor:string;unallocatedMinor:string;invoiceCount:number}>={};
    for(const currency of ["TZS","USD"]){
      summary[currency]={invoicedMinor:"0",collectedMinor:"0",outstandingMinor:"0",creditBalanceMinor:"0",unallocatedMinor:"0",invoiceCount:0};
    }
    for(const row of invoices.data??[]){
      const target=summary[row.currency];if(!target)continue;
      target.invoicedMinor=(BigInt(target.invoicedMinor)+BigInt(row.total_minor)).toString();
      target.collectedMinor=(BigInt(target.collectedMinor)+BigInt(row.amount_paid_minor)).toString();
      target.outstandingMinor=(BigInt(target.outstandingMinor)+BigInt(row.outstanding_minor)).toString();
      target.creditBalanceMinor=(BigInt(target.creditBalanceMinor)+BigInt(row.credit_balance_minor)).toString();
      target.invoiceCount+=1;
    }
    for(const row of unallocated.data??[]){
      const target=summary[row.currency];if(target)target.unallocatedMinor=(BigInt(target.unallocatedMinor)+BigInt(row.unallocated_minor)).toString();
    }
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"receivables.tenant_position_viewed",
      resourceType:"tenant_receivables",resourceRef:actor.organisationId,metadata:{currencies:["TZS","USD"]}});
    return summary;
  });

export const previewCommercialProration=createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({
    fullAmountMinor:z.number().int().nonnegative().safe(),
    billableUnits:z.number().int().nonnegative().safe(),
    totalUnits:z.number().int().positive().safe(),
    rounding:z.enum(["half_up","floor"]),
    contractReference:z.string().trim().min(4).max(200),
  }).refine(value=>value.billableUnits<=value.totalUnits,{message:"Billable units cannot exceed total units."}).parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context);
    const amountMinor=calculateCommercialProration(data);
    const admin=await getAdmin();
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:"founder_admin",action:"billing.proration_previewed",
      resourceType:"billing_calculation",resourceRef:data.contractReference,
      metadata:{fullAmountMinor:data.fullAmountMinor,billableUnits:data.billableUnits,
        totalUnits:data.totalUnits,rounding:data.rounding,amountMinor}});
    return {amountMinor,contractReference:data.contractReference,rounding:data.rounding};
  });

export const listMyCommercialPaymentMethods=createServerFn({method:"GET"})
  .middleware([requireSupabaseAuth])
  .handler(async({context})=>{
    const actor=await resolveVerifiedTenantActor(context);
    if(actor.actorRole!=="tenant_admin") throw new Error("Forbidden: tenant administrator authority is required.");
    const admin=await getAdmin();
    const {data,error}=await admin.from("commercial_provider_accounts")
      .select("id,provider,provider_account_ref,supported_currencies,public_configuration")
      .eq("organisation_id",actor.organisationId).eq("status","active")
      .order("provider",{ascending:true});
    if(error) throw new Error("Active commercial payment methods could not be loaded.");
    await writeFinancialAudit(admin,{requestId:globalThis.crypto.randomUUID(),actorUserId:actor.userId,
      organisationId:actor.organisationId,actorRole:actor.actorRole,action:"payment.methods_viewed",
      resourceType:"payment_method_index",resourceRef:actor.organisationId,metadata:{methodCount:data?.length??0}});
    return data??[];
  });
