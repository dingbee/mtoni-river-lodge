import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor } from "./subscription.functions";

type Row = Record<string, unknown>;
type MoneyByCurrency = { TZS: number; USD: number };
const emptyMoney = (): MoneyByCurrency => ({ TZS: 0, USD: 0 });
const numeric = (value: unknown) => { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; };
const currencyOf = (value: unknown): "TZS" | "USD" | null => value === "TZS" || value === "USD" ? value : null;
const addMoney = (target: MoneyByCurrency, currency: unknown, amount: unknown) => { const key = currencyOf(currency); if (key) target[key] += numeric(amount); };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

export const getFounderCommercialWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [organisationsResult, accountsResult, subscriptionsResult, propertiesResult, invoicesResult, paymentsResult, assignmentsResult, eventsResult, financialEventsResult, policyVersionsResult, policyCurrentResult, notificationsResult, decisionsResult, providerAccountsResult, unallocatedResult, reconciliationRunsResult, grantRulesResult] = await Promise.all([
      admin.from("staynas_organisations").select("id,slug,name,status,created_at").order("created_at", { ascending: false }),
      admin.from("commercial_accounts").select("id,organisation_id,status,created_at,updated_at"),
      admin.from("commercial_subscriptions").select("id,account_id,plan_code,plan_version,currency,billing_term,status,property_count,addon_codes,trial_started_at,trial_ends_at,current_period_starts_at,current_period_ends_at,cancel_at_period_end,accepted_price_snapshot,quote_required,created_at"),
      admin.from("staynas_properties").select("id,organisation_id,name,status,created_at"),
      admin.from("commercial_invoice_receivables").select("id,organisation_id,account_id,subscription_id,invoice_number,currency,status,issued_at,due_at,total_minor,amount_paid_minor,outstanding_minor,is_overdue"),
      admin.from("commercial_payment_transactions").select("id,organisation_id,invoice_id,provider,provider_transaction_ref,amount_minor,currency,payment_method,status,confirmed_at,created_at").order("created_at", { ascending: false }),
      admin.from("commercial_entitlement_assignments").select("id,organisation_id,feature_code,source_type,status,effective_from,effective_to"),
      admin.from("commercial_audit_events").select("id,actor_user_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,occurred_at,metadata").order("occurred_at", { ascending: false }).limit(30),
      admin.from("commercial_financial_audit_events").select("id,actor_user_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,occurred_at,metadata").order("occurred_at", { ascending: false }).limit(30),
      admin.from("commercial_policy_config_versions").select("id,policy_type,version,status,effective_from,effective_to,created_at").order("created_at", { ascending: false }),
      admin.from("commercial_policy_config_current").select("policy_type,version_id,published_at"),
      admin.from("commercial_financial_notifications").select("id,organisation_id,invoice_id,payment_id,notification_type,recipient_email,status,provider_message_ref,attempted_at,sent_at,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("commercial_entitlement_decisions").select("id,organisation_id,feature_code,allowed,outcome,source_type,reason,decided_at").order("decided_at", { ascending: false }).limit(100),
      admin.from("commercial_provider_accounts").select("id,organisation_id,provider,provider_account_ref,supported_currencies,status,created_at").order("created_at", { ascending: false }),
      admin.from("commercial_unallocated_collections").select("*").order("confirmed_at", { ascending: false }),
      admin.from("commercial_reconciliation_runs").select("id,organisation_id,provider_account_id,currency,period_start,period_end,status,source_ref,completed_at,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("commercial_entitlement_grant_rules").select("id,grant_type,organisation_id,addon_code,feature_code,effect,effective_from,effective_to,reason,created_by,created_at").order("created_at", { ascending: false }),
    ]);
    const errors = [organisationsResult, accountsResult, subscriptionsResult, propertiesResult, invoicesResult, paymentsResult, assignmentsResult, eventsResult, financialEventsResult, policyVersionsResult, policyCurrentResult, notificationsResult, decisionsResult, providerAccountsResult, unallocatedResult, reconciliationRunsResult, grantRulesResult].filter((result) => result.error);
    if (errors.length) throw new Error("Founder commercial workspace data could not be loaded from authoritative records.");
    const organisations = rows(organisationsResult.data);
    const accounts = rows(accountsResult.data);
    const subscriptions = rows(subscriptionsResult.data);
    const properties = rows(propertiesResult.data);
    const invoices = rows(invoicesResult.data);
    const payments = rows(paymentsResult.data);
    const assignments = rows(assignmentsResult.data);
    const now = Date.now();
    const soon = now + 30 * 24 * 60 * 60 * 1000;
    const accountByOrg = new Map(accounts.map((item) => [String(item.organisation_id), item]));
    const subscriptionsByAccount = new Map<string, Row[]>();
    for (const subscription of subscriptions) {
      const key = String(subscription.account_id);
      subscriptionsByAccount.set(key, [...(subscriptionsByAccount.get(key) ?? []), subscription]);
    }
    const tenantRows = organisations.map((organisation) => {
      const account = accountByOrg.get(String(organisation.id));
      const tenantSubscriptions = account ? subscriptionsByAccount.get(String(account.id)) ?? [] : [];
      const latestSubscription = [...tenantSubscriptions].sort((a, b) => Date.parse(String(b.created_at ?? "")) - Date.parse(String(a.created_at ?? "")))[0] ?? null;
      const tenantInvoices = invoices.filter((invoice) => invoice.organisation_id === organisation.id);
      const tenantPayments = payments.filter((payment) => payment.organisation_id === organisation.id);
      const tenantProperties = properties.filter((property) => property.organisation_id === organisation.id);
      const tenantAssignments = assignments.filter((assignment) => assignment.organisation_id === organisation.id && assignment.status === "active");
      const outstandingByCurrency = emptyMoney();
      for (const invoice of tenantInvoices) addMoney(outstandingByCurrency, invoice.currency, invoice.outstanding_minor);
      const lastSuccessfulPayment = tenantPayments.find((payment) => ["successful", "partially_reversed"].includes(String(payment.status)) && currencyOf(payment.currency) !== null) ?? null;
      const overdue = tenantInvoices.some((invoice) => invoice.is_overdue === true);
      const renewalAt = latestSubscription?.current_period_ends_at ? Date.parse(String(latestSubscription.current_period_ends_at)) : NaN;
      const commercialHealth = overdue ? "attention_required" : !latestSubscription ? "not_provisioned" : Number.isFinite(renewalAt) && renewalAt <= soon ? "renewal_approaching" : String(latestSubscription.status) === "active" ? "healthy" : "review";
      return {
        id: String(organisation.id), slug: String(organisation.slug ?? ""), name: String(organisation.name ?? "Unnamed organisation"),
        status: String(organisation.status ?? "unknown"), registeredAt: organisation.created_at ?? null,
        accountId: account ? String(account.id) : null, accountStatus: account ? String(account.status) : "not_provisioned",
        propertyCount: tenantProperties.length, subscriptionCount: tenantSubscriptions.length,
        subscription: latestSubscription ? {
          id: String(latestSubscription.id), planCode: String(latestSubscription.plan_code), planVersion: numeric(latestSubscription.plan_version),
          status: String(latestSubscription.status), currency: currencyOf(latestSubscription.currency), billingTerm: String(latestSubscription.billing_term ?? ""),
          propertyAllowance: numeric(latestSubscription.property_count), trialEndsAt: latestSubscription.trial_ends_at ?? null,
          renewalAt: latestSubscription.current_period_ends_at ?? null, quoteRequired: latestSubscription.quote_required === true,
        } : null,
        entitlementCount: tenantAssignments.length, outstandingByCurrency,
        overdueInvoiceCount: tenantInvoices.filter((invoice) => invoice.is_overdue === true).length,
        lastPayment: lastSuccessfulPayment ? {
          amountMinor: numeric(lastSuccessfulPayment.amount_minor), currency: currencyOf(lastSuccessfulPayment.currency) as "TZS" | "USD",
          confirmedAt: lastSuccessfulPayment.confirmed_at ?? null, reference: lastSuccessfulPayment.provider_transaction_ref ?? null,
        } : null,
        commercialHealth,
      };
    });
    const invoicedByCurrency = emptyMoney();
    const collectedByCurrency = emptyMoney();
    const outstandingByCurrency = emptyMoney();
    for (const invoice of invoices) {
      addMoney(invoicedByCurrency, invoice.currency, invoice.total_minor);
      addMoney(collectedByCurrency, invoice.currency, invoice.amount_paid_minor);
      addMoney(outstandingByCurrency, invoice.currency, invoice.outstanding_minor);
    }
    const recurringByCurrency = { TZS: { mrrMinor: 0, arrMinor: 0 }, USD: { mrrMinor: 0, arrMinor: 0 } };
    for (const subscription of subscriptions) {
      if (subscription.status !== "active") continue;
      const currency = currencyOf(subscription.currency);
      if (!currency) continue;
      const snapshot = subscription.accepted_price_snapshot as Record<string, unknown> | null;
      const total = numeric(snapshot?.totalAmountMinor);
      if (total <= 0 || subscription.quote_required === true) continue;
      if (subscription.billing_term === "monthly") { recurringByCurrency[currency].mrrMinor += total; recurringByCurrency[currency].arrMinor += total * 12; }
      else if (subscription.billing_term === "annual") { recurringByCurrency[currency].mrrMinor += total / 12; recurringByCurrency[currency].arrMinor += total; }
    }
    const recentEvents = [
      ...rows(eventsResult.data).map((event) => ({ ...event, eventSource: "commercial" })),
      ...rows(financialEventsResult.data).map((event) => ({ ...event, eventSource: "financial" })),
    ].sort((a, b) => Date.parse(String(b.occurred_at ?? "")) - Date.parse(String(a.occurred_at ?? ""))).slice(0, 20);
    return {
      generatedAt: new Date().toISOString(),
      metrics: {
        totalTenants: organisations.length, activeTenants: organisations.filter((item) => item.status === "active").length,
        trialTenants: tenantRows.filter((item) => item.subscription?.status === "trialing").length,
        paidSubscriptions: subscriptions.filter((item) => item.status === "active").length,
        suspendedTenants: tenantRows.filter((item) => item.subscription?.status === "suspended").length,
        expiredSubscriptions: subscriptions.filter((item) => item.status === "expired").length,
        renewalsApproaching: subscriptions.filter((item) => { const d = Date.parse(String(item.current_period_ends_at ?? "")); return Number.isFinite(d) && d >= now && d <= soon; }).length,
        overdueInvoices: invoices.filter((item) => item.is_overdue === true).length,
        totalInvoicedByCurrency: invoicedByCurrency, collectedByCurrency, outstandingByCurrency, mrrArrByCurrency: recurringByCurrency,
      },
      tenants: tenantRows,
      subscriptions: subscriptions.map((subscription) => {
        const account = accounts.find((item) => item.id === subscription.account_id);
        const organisation = organisations.find((item) => item.id === account?.organisation_id);
        return { ...subscription, organisation_id: account?.organisation_id ?? null, tenant_name: organisation?.name ?? "Unknown tenant" };
      }),
      invoices: invoices.map((invoice) => {
        const organisation = organisations.find((item) => item.id === invoice.organisation_id);
        return { ...invoice, tenant_name: organisation?.name ?? "Unknown tenant" };
      }),
      payments: payments.map((payment) => {
        const organisation = organisations.find((item) => item.id === payment.organisation_id);
        return { ...payment, tenant_name: organisation?.name ?? "Unknown tenant" };
      }),
      entitlementAssignments: assignments,
      entitlementDecisions: rows(decisionsResult.data),
      policyVersions: rows(policyVersionsResult.data),
      policyCurrent: rows(policyCurrentResult.data),
      notifications: rows(notificationsResult.data),
      providerAccounts: rows(providerAccountsResult.data).map((provider) => ({
        ...provider, tenant_name: organisations.find((organisation) => organisation.id === provider.organisation_id)?.name ?? "Unknown tenant",
      })),
      unallocatedCollections: rows(unallocatedResult.data).map((collection) => ({
        ...collection, tenant_name: organisations.find((organisation) => organisation.id === collection.organisation_id)?.name ?? "Unknown tenant",
      })),
      reconciliationRuns: rows(reconciliationRunsResult.data).map((run) => ({
        ...run, tenant_name: organisations.find((organisation) => organisation.id === run.organisation_id)?.name ?? "Unknown tenant",
      })),
      entitlementGrantRules: rows(grantRulesResult.data),
      recentEvents,
    };
  });

export const getFounderTenantCommercialProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organisationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: organisation, error: organisationError } = await admin.from("staynas_organisations")
      .select("id,slug,name,status,created_at,updated_at").eq("id", data.organisationId).maybeSingle();
    if (organisationError || !organisation) throw new Error("Tenant commercial profile was not found.");
    const [accountResult, propertiesResult] = await Promise.all([
      admin.from("commercial_accounts").select("id,organisation_id,status,created_at,updated_at").eq("organisation_id", data.organisationId).maybeSingle(),
      admin.from("staynas_properties").select("id,name,slug,code,status,currency,timezone,created_at").eq("organisation_id", data.organisationId).order("created_at", { ascending: true }),
    ]);
    if (accountResult.error || propertiesResult.error) throw new Error("Tenant identity and property records could not be loaded.");
    const account = accountResult.data as Row | null;
    if (!account) return { organisation, account: null, properties: rows(propertiesResult.data), subscriptions: [], subscriptionEvents: [], invoices: [], payments: [], assignments: [], decisions: [], notifications: [] };
    const [subscriptionsResult, invoicesResult, paymentsResult, assignmentsResult, decisionsResult, notificationsResult] = await Promise.all([
      admin.from("commercial_subscriptions").select("*").eq("account_id", account.id).order("created_at", { ascending: false }),
      admin.from("commercial_invoice_receivables").select("*").eq("organisation_id", data.organisationId).order("issued_at", { ascending: false }),
      admin.from("commercial_payment_transactions").select("*").eq("organisation_id", data.organisationId).order("created_at", { ascending: false }),
      admin.from("commercial_entitlement_assignments").select("*").eq("organisation_id", data.organisationId).order("created_at", { ascending: false }),
      admin.from("commercial_entitlement_decisions").select("*").eq("organisation_id", data.organisationId).order("decided_at", { ascending: false }).limit(100),
      admin.from("commercial_financial_notifications").select("id,invoice_id,payment_id,notification_type,recipient_email,status,provider_message_ref,attempted_at,sent_at,created_at").eq("organisation_id", data.organisationId).order("created_at", { ascending: false }).limit(100),
    ]);
    const relatedErrors = [subscriptionsResult, invoicesResult, paymentsResult, assignmentsResult, decisionsResult, notificationsResult].filter((result) => result.error);
    if (relatedErrors.length) throw new Error("Tenant commercial history could not be loaded.");
    const subscriptions = rows(subscriptionsResult.data);
    const subscriptionIds = subscriptions.map((item) => String(item.id));
    const invoiceIds = rows(invoicesResult.data).map((item) => String(item.id));
    const paymentIds = rows(paymentsResult.data).map((item) => String(item.id));
    const [subscriptionEventsResult, commercialAuditResult, financialAuditResult] = await Promise.all([
      subscriptionIds.length ? admin.from("commercial_subscription_events").select("*").in("subscription_id", subscriptionIds).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
      admin.from("commercial_audit_events").select("*").order("occurred_at", { ascending: false }).limit(300),
      admin.from("commercial_financial_audit_events").select("*").order("occurred_at", { ascending: false }).limit(300),
    ]);
    if (subscriptionEventsResult.error || commercialAuditResult.error || financialAuditResult.error) {
      throw new Error("Tenant commercial audit history could not be loaded.");
    }
    const auditIds = new Set([...subscriptionIds, ...invoiceIds, ...paymentIds, String(account.id), data.organisationId]);
    const auditEvents = [
      ...rows(commercialAuditResult.data).filter((event) => auditIds.has(String(event.resource_ref))),
      ...rows(financialAuditResult.data).filter((event) => auditIds.has(String(event.resource_ref))),
    ].sort((a, b) => Date.parse(String(b.occurred_at ?? "")) - Date.parse(String(a.occurred_at ?? "")));
    return {
      organisation,
      account,
      properties: rows(propertiesResult.data),
      subscriptions,
      subscriptionEvents: rows(subscriptionEventsResult.data),
      invoices: rows(invoicesResult.data),
      payments: rows(paymentsResult.data),
      assignments: rows(assignmentsResult.data),
      decisions: rows(decisionsResult.data),
      notifications: rows(notificationsResult.data),
      auditEvents,
    };
  });
