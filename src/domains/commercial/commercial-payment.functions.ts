import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor, resolveVerifiedTenantActor } from "./subscription.functions";

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
  return supabaseAdmin as any;
}

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
      .eq("organisation_id", actor.organisationId).order("issued_at", { ascending: false });
    if (error) throw new Error("Unable to load tenant invoices.");
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
    if (payment.amount_minor !== data.amountMinor || payment.currency !== data.currency) {
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
    return result;
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
      .select("id,organisation_id,provider_account_id,provider,amount_minor,currency,status")
      .eq("id", data.paymentId).eq("organisation_id", actor.organisationId).maybeSingle();
    if (error || !payment || payment.provider !== "pesapal" || payment.status !== "pending") {
      throw new Error("Pending tenant Pesapal payment attempt was not found.");
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
    const order = await initiateTenantPesapalOrder({
      providerAccountId: providerAccount.id, secretRef: providerAccount.credential_secret_ref,
      paymentId: payment.id, amountMinor: Number(payment.amount_minor), currency: payment.currency,
      email: data.email, phone: data.phone, firstName: data.firstName, lastName: data.lastName,
      callbackUrl: `${baseUrl.replace(/\/$/, "")}/api/public/commercial-pesapal/ipn`,
    });
    const { error: updateError } = await admin.from("commercial_payment_transactions").update({
      provider_order_ref: order.orderTrackingId, payment_method: "pesapal", updated_at: new Date().toISOString(),
    }).eq("id", payment.id).eq("status", "pending");
    if (updateError) throw new Error("Pesapal order reference could not be persisted.");
    return { paymentId: payment.id, redirectUrl: order.redirectUrl, provider: "pesapal" as const };
  });

const providerAccountInput = z.object({
  organisationId: z.string().uuid(),
  provider: z.enum(["pesapal","airtel_money","mixx_by_yas","mpesa","halopesa","bank_transfer","manual"]),
  providerAccountRef: z.string().trim().min(2).max(200),
  credentialSecretRef: z.string().regex(/^STAYNAS_PROVIDER_SECRET_[A-Z0-9_]+$/),
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
    const { data: provider, error: providerError } = await admin.from("commercial_provider_accounts")
      .insert({
        organisation_id: data.organisationId, provider: data.provider,
        provider_account_ref: data.providerAccountRef,
        credential_secret_ref: data.credentialSecretRef,
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
    if (error || !invoice) throw new Error("Invoice not found in the active tenant.");
    const [lines, payments, adjustments] = await Promise.all([
      admin.from("commercial_invoice_lines").select("*").eq("invoice_id", invoice.id).order("created_at"),
      admin.from("commercial_payment_transactions").select("id,provider,provider_transaction_ref,amount_minor,currency,status,initiated_at,confirmed_at")
        .eq("invoice_id", invoice.id).order("created_at"),
      admin.from("commercial_invoice_adjustments").select("*").eq("invoice_id", invoice.id).order("created_at"),
    ]);
    if (lines.error || payments.error || adjustments.error) throw new Error("Financial document records could not be loaded.");
    return { invoice, lines: lines.data ?? [], payments: payments.data ?? [], adjustments: adjustments.data ?? [] };
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
    if (error || !invoice) throw new Error("Invoice not found in the active tenant.");
    const [lines, adjustments] = await Promise.all([
      admin.from("commercial_invoice_lines").select("*").eq("invoice_id",invoice.id).order("created_at"),
      admin.from("commercial_invoice_adjustments").select("*").eq("invoice_id",invoice.id).order("created_at"),
    ]);
    if (lines.error || adjustments.error) throw new Error("Invoice document records could not be loaded.");
    const { buildCommercialInvoicePdf } = await import("./commercial-invoice-document.server");
    const bytes = await buildCommercialInvoicePdf({
      invoice, lines: lines.data ?? [], adjustments: adjustments.data ?? [],
    });
    return { fileName: `${invoice.invoice_number}.pdf`, bytes: Array.from(bytes) };
  });
