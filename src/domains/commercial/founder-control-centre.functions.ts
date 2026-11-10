import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCommercialPrice } from "./pricing-engine";
import { validateFounderPolicyPayload } from "./founder-policy.functions";
import { validatePackageComposition } from "./package-composition-contract";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor } from "./subscription.functions";

import type { SupabaseClient } from "@supabase/supabase-js";
type SupabaseAdminClient = SupabaseClient;

type Row = Record<string, unknown>;
type MoneyByCurrency = { TZS: string; USD: string };
const emptyMoney = (): MoneyByCurrency => ({ TZS: "0", USD: "0" });
const numeric = (value: unknown) => { const result = Number(value ?? 0); return Number.isFinite(result) ? result : 0; };
const currencyOf = (value: unknown): "TZS" | "USD" | null => value === "TZS" || value === "USD" ? value : null;
const addMoney = (target: MoneyByCurrency, currency: unknown, amount: unknown) => { const key = currencyOf(currency); if (key) target[key] = (BigInt(target[key]) + BigInt(String(amount ?? 0))).toString(); };
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAllRows(admin: any, table: string, select: string, configure: (query: any) => any) {
  const result: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await configure(admin.from(table).select(select)).range(offset, offset + pageSize - 1);
    if (error) return { data: null, error };
    const page = rows(data);
    result.push(...page);
    if (page.length < pageSize) return { data: result, error: null };
  }
}


export const getFounderCommercialWorkspace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [organisationsResult, founderConfigResult, accountsResult, contactsResult, subscriptionsResult, propertiesResult, invoicesResult, paymentsResult, assignmentsResult, eventsResult, financialEventsResult, policyVersionsResult, policyCurrentResult, notificationsResult, decisionsResult, providerAccountsResult, unallocatedResult, reconciliationRunsResult, grantRulesResult] = await Promise.all([
      readAllRows(admin,"staynas_organisations","id,slug,name,status,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
      admin.from("commercial_founder_tenant_config").select("founder_organisation_id").eq("singleton",true).maybeSingle(),
      readAllRows(admin,"commercial_accounts","id,organisation_id,status,created_at,updated_at",(query)=>query.order("organisation_id").order("id")),
      readAllRows(admin,"commercial_account_contacts","account_id,contact_name,contact_email,contact_phone,contact_role,created_at,updated_at",(query)=>query.order("account_id").order("created_at").order("contact_email")),
      readAllRows(admin,"commercial_subscriptions","id,account_id,plan_code,plan_version,currency,billing_term,status,property_count,addon_codes,trial_started_at,trial_ends_at,current_period_starts_at,current_period_ends_at,cancel_at_period_end,accepted_price_snapshot,quote_required,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
      readAllRows(admin,"staynas_properties","id,organisation_id,name,status,created_at",(query)=>query.order("organisation_id").order("id")),
      readAllRows(admin,"commercial_founder_invoice_workspace_facts","id,organisation_id,account_id,subscription_id,invoice_number,currency,status,issued_at,due_at,total_minor,amount_paid_minor,outstanding_minor,is_overdue",(query)=>query.order("organisation_id").order("issued_at").order("id")),
      readAllRows(admin,"commercial_founder_payment_workspace_facts","id,organisation_id,invoice_id,provider,provider_transaction_ref,amount_minor,currency,payment_method,status,confirmed_at,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
      readAllRows(admin,"commercial_entitlement_assignments","id,organisation_id,feature_code,source_type,status,effective_from,effective_to",(query)=>query.order("organisation_id").order("subscription_id").order("feature_code")),
      admin.from("commercial_audit_events").select("id,actor_user_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,occurred_at,metadata").order("occurred_at", { ascending: false }).limit(30),
      admin.from("commercial_financial_audit_events").select("id,actor_user_id,actor_role,action,resource_type,resource_ref,outcome,reason_code,occurred_at,metadata").order("occurred_at", { ascending: false }).limit(30),
      readAllRows(admin,"commercial_policy_config_versions","id,policy_type,version,status,effective_from,effective_to,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
      admin.from("commercial_policy_config_current").select("policy_type,version_id,published_at"),
      admin.from("commercial_financial_notifications").select("id,organisation_id,invoice_id,payment_id,notification_type,recipient_email,status,provider_message_ref,attempted_at,sent_at,created_at").order("created_at", { ascending: false }).limit(100),
      admin.from("commercial_entitlement_decisions").select("id,organisation_id,feature_code,allowed,outcome,source_type,reason,decided_at").order("decided_at", { ascending: false }).limit(100),
      readAllRows(admin,"commercial_provider_accounts","id,organisation_id,provider,provider_account_ref,supported_currencies,status,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
      readAllRows(admin,"commercial_founder_unallocated_collection_workspace_facts","payment_id,organisation_id,account_id,provider,provider_transaction_ref,amount_minor,currency,status,confirmed_at,unallocated_minor",(query)=>query.order("confirmed_at",{ascending:false}).order("payment_id",{ascending:false})),
      admin.from("commercial_reconciliation_runs").select("id,organisation_id,provider_account_id,currency,period_start,period_end,status,source_ref,completed_at,created_at").order("created_at", { ascending: false }).limit(100),
      readAllRows(admin,"commercial_entitlement_grant_rules","id,grant_type,organisation_id,addon_code,feature_code,effect,effective_from,effective_to,reason,created_by,created_at",(query)=>query.order("created_at",{ascending:false}).order("id",{ascending:false})),
    ]);
    const errors = [organisationsResult, founderConfigResult, accountsResult, contactsResult, subscriptionsResult, propertiesResult, invoicesResult, paymentsResult, assignmentsResult, eventsResult, financialEventsResult, policyVersionsResult, policyCurrentResult, notificationsResult, decisionsResult, providerAccountsResult, unallocatedResult, reconciliationRunsResult, grantRulesResult].filter((result) => result.error);
    if (errors.length) throw new Error("Founder commercial workspace data could not be loaded from authoritative records.");
    const founderOrganisationId = String((founderConfigResult.data as {founder_organisation_id?:string}|null)?.founder_organisation_id ?? "");
    if (!founderOrganisationId) throw new Error("Founder tenant boundary configuration is missing.");
    // The founder organisation is the platform owner, not a customer tenant.
    const organisations = rows(organisationsResult.data).filter((organisation)=>String(organisation.id)!==founderOrganisationId);
    const customerOrganisationIds = new Set(organisations.map((organisation)=>String(organisation.id)));
    const accounts = rows(accountsResult.data).filter((account)=>customerOrganisationIds.has(String(account.organisation_id)));
    const customerAccountIds = new Set(accounts.map((account)=>String(account.id)));
    const contacts = rows(contactsResult.data).filter((contact)=>customerAccountIds.has(String(contact.account_id)));
    const contactByAccount = new Map(contacts.map((contact) => [String(contact.account_id), contact]));
    const subscriptions = rows(subscriptionsResult.data).filter((subscription)=>customerAccountIds.has(String(subscription.account_id)));
    const properties = rows(propertiesResult.data).filter((property)=>customerOrganisationIds.has(String(property.organisation_id)));
    const invoices = rows(invoicesResult.data).filter((invoice)=>customerOrganisationIds.has(String(invoice.organisation_id)));
    const payments = rows(paymentsResult.data).filter((payment)=>customerOrganisationIds.has(String(payment.organisation_id)));
    const assignments = rows(assignmentsResult.data).filter((assignment)=>customerOrganisationIds.has(String(assignment.organisation_id)));
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
        primaryContact: account ? contactByAccount.get(String(account.id)) ?? null : null,
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
          amountMinor: String(lastSuccessfulPayment.amount_minor ?? "0"), currency: currencyOf(lastSuccessfulPayment.currency) as "TZS" | "USD",
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
    const recurringByCurrency = { TZS: { mrrMinor: "0", arrMinor: "0" }, USD: { mrrMinor: "0", arrMinor: "0" } };
    const recurringResult = customerOrganisationIds.size
      ? await readAllRows(admin,"commercial_subscription_recurring_value_facts",
        "subscription_id,account_id,organisation_id,currency,mrr_minor,arr_minor",
        (query)=>query.in("organisation_id",Array.from(customerOrganisationIds))
          .order("organisation_id").order("account_id").order("subscription_id"))
      : { data: [], error: null };
    if (recurringResult.error) throw new Error("Exact recurring subscription values could not be loaded.");
    for (const fact of rows(recurringResult.data)) {
      const currency = currencyOf(fact.currency);
      if (!currency) continue;
      recurringByCurrency[currency].mrrMinor = (BigInt(recurringByCurrency[currency].mrrMinor) + BigInt(String(fact.mrr_minor))).toString();
      recurringByCurrency[currency].arrMinor = (BigInt(recurringByCurrency[currency].arrMinor) + BigInt(String(fact.arr_minor))).toString();
    }
    const recentEvents: Row[] = [
      ...rows(eventsResult.data).map((event): Row => ({ ...event, eventSource: "commercial" })),
      ...rows(financialEventsResult.data).map((event): Row => ({ ...event, eventSource: "financial" })),
    ];
    recentEvents.sort((a, b) => Date.parse(String(b.occurred_at ?? "")) - Date.parse(String(a.occurred_at ?? "")));
    const workspace = {
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
      entitlementDecisions: rows(decisionsResult.data).filter((decision)=>customerOrganisationIds.has(String(decision.organisation_id))),
      policyVersions: rows(policyVersionsResult.data),
      policyCurrent: rows(policyCurrentResult.data),
      notifications: rows(notificationsResult.data).filter((notification)=>customerOrganisationIds.has(String(notification.organisation_id))),
      providerAccounts: rows(providerAccountsResult.data).filter((provider)=>customerOrganisationIds.has(String(provider.organisation_id))).map((provider) => ({
        ...provider, tenant_name: organisations.find((organisation) => organisation.id === provider.organisation_id)?.name ?? "Unknown tenant",
      })),
      unallocatedCollections: rows(unallocatedResult.data).filter((collection)=>customerOrganisationIds.has(String(collection.organisation_id))).map((collection) => ({
        ...collection, tenant_name: organisations.find((organisation) => organisation.id === collection.organisation_id)?.name ?? "Unknown tenant",
      })),
      reconciliationRuns: rows(reconciliationRunsResult.data).filter((run)=>customerOrganisationIds.has(String(run.organisation_id))).map((run) => ({
        ...run, tenant_name: organisations.find((organisation) => organisation.id === run.organisation_id)?.name ?? "Unknown tenant",
      })),
      entitlementGrantRules: rows(grantRulesResult.data),
      recentEvents: recentEvents.slice(0, 20),
    };
    return JSON.parse(JSON.stringify(workspace));
  });

export const getFounderTenantCommercialProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ organisationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [{ data: organisation, error: organisationError }, { data: founderConfig, error: founderConfigError }] = await Promise.all([
      admin.from("staynas_organisations").select("id,slug,name,status,created_at,updated_at").eq("id", data.organisationId).maybeSingle(),
      admin.from("commercial_founder_tenant_config").select("founder_organisation_id").eq("singleton",true).maybeSingle(),
    ]);
    if (organisationError || founderConfigError || !organisation || organisation.id===founderConfig?.founder_organisation_id) throw new Error("Customer tenant commercial profile was not found.");
    const [accountResult, propertiesResult] = await Promise.all([
      admin.from("commercial_accounts").select("id,organisation_id,status,created_at,updated_at").eq("organisation_id", data.organisationId).maybeSingle(),
      admin.from("staynas_properties").select("id,name,slug,code,status,currency,timezone,created_at").eq("organisation_id", data.organisationId).order("created_at", { ascending: true }),
    ]);
    if (accountResult.error || propertiesResult.error) throw new Error("Tenant identity and property records could not be loaded.");
    const account = accountResult.data as Row | null;
    if (!account) return JSON.parse(JSON.stringify({ organisation, account: null, contact: null, properties: rows(propertiesResult.data), subscriptions: [], subscriptionEvents: [], invoices: [], payments: [], assignments: [], decisions: [], notifications: [] }));
    const { data: contact, error: contactError } = await admin.from("commercial_account_contacts")
      .select("account_id,contact_name,contact_email,contact_phone,contact_role,created_at,updated_at")
      .eq("account_id", account.id).maybeSingle();
    if (contactError) throw new Error("Tenant commercial contact record could not be loaded.");
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
    return JSON.parse(JSON.stringify({
      organisation,
      account,
      contact,
      properties: rows(propertiesResult.data),
      subscriptions,
      subscriptionEvents: rows(subscriptionEventsResult.data),
      invoices: rows(invoicesResult.data),
      payments: rows(paymentsResult.data),
      assignments: rows(assignmentsResult.data),
      decisions: rows(decisionsResult.data),
      notifications: rows(notificationsResult.data),
      auditEvents,
    }));
  });

const founderNotificationInput = z.object({ notificationId: z.string().uuid() });

async function writeFounderNotificationAudit(admin: SupabaseAdminClient, actor: { userId: string; organisationId: string }, action: string, notificationId: string) {
  const { error } = await admin.from("commercial_audit_events").insert({
    request_id: globalThis.crypto.randomUUID(),
    actor_user_id: actor.userId,
    actor_organisation_id: actor.organisationId,
    actor_role: "founder_admin",
    action,
    resource_type: "founder_notification",
    resource_ref: notificationId,
    outcome: "succeeded",
    reason_code: null,
    metadata: {},
  });
  if (error) throw new Error("Founder notification audit evidence could not be persisted.");
}

/** Materialize deduplicated alerts from current commercial records. No tenant-facing notification table is reused. */
export const syncFounderCommercialNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const actor = await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [organisationsResult, founderConfigResult, accountsResult, subscriptionsResult, invoicesResult, paymentsResult, reconciliationResult, decisionsResult] = await Promise.all([
      admin.from("staynas_organisations").select("id,name"),
      admin.from("commercial_founder_tenant_config").select("founder_organisation_id").eq("singleton",true).maybeSingle(),
      admin.from("commercial_accounts").select("id,organisation_id"),
      admin.from("commercial_subscriptions").select("id,account_id,plan_code,status,trial_ends_at,current_period_ends_at,currency"),
      admin.from("commercial_invoice_receivables").select("id,organisation_id,invoice_number,currency,outstanding_minor,due_at,is_overdue,status").limit(200),
      admin.from("commercial_payment_transactions").select("id,organisation_id,provider,amount_minor,currency,status,created_at").eq("status","failed").order("created_at",{ascending:false}).limit(100),
      admin.from("commercial_reconciliation_runs").select("id,organisation_id,currency,status,source_ref").eq("status","discrepancy").order("created_at",{ascending:false}).limit(100),
      admin.from("commercial_entitlement_decisions").select("id,organisation_id,feature_code,outcome,reason,decided_at").eq("allowed",false).eq("outcome","commercial_review_required").order("decided_at",{ascending:false}).limit(100),
    ]);
    const errors=[organisationsResult,founderConfigResult,accountsResult,subscriptionsResult,invoicesResult,paymentsResult,reconciliationResult,decisionsResult].filter((result)=>result.error);
    if(errors.length) throw new Error("Commercial alert source records could not be evaluated.");
    const founderOrganisationId=String((founderConfigResult.data as {founder_organisation_id?:string}|null)?.founder_organisation_id??"");
    if(!founderOrganisationId) throw new Error("Founder tenant boundary configuration is missing.");
    const organisations=rows(organisationsResult.data).filter((organisation)=>String(organisation.id)!==founderOrganisationId);
    const customerOrganisationIds=new Set(organisations.map((organisation)=>String(organisation.id)));
    const accounts=rows(accountsResult.data).filter((account)=>customerOrganisationIds.has(String(account.organisation_id)));
    const subscriptions=rows(subscriptionsResult.data);
    const now=Date.now();
    const sevenDays=now+7*24*60*60*1000;
    const thirtyDays=now+30*24*60*60*1000;
    const alerts: Row[]=[];
    const tenantName=(organisationId: unknown)=>String(organisations.find((item)=>item.id===organisationId)?.name??"Customer tenant");
    const accountOrg=new Map(accounts.map((item)=>[String(item.id),item.organisation_id]));
    for(const subscription of subscriptions){
      const organisationId=accountOrg.get(String(subscription.account_id));
      if(subscription.status==="trialing" && subscription.trial_ends_at){
        const expiry=Date.parse(String(subscription.trial_ends_at));
        if(Number.isFinite(expiry)&&expiry>=now&&expiry<=sevenDays){
          alerts.push({dedupe_key:`trial-expiring:${subscription.id}:${subscription.trial_ends_at}`,organisation_id:organisationId,alert_type:"trial_expiring",severity:"warning",title:"Trial approaching expiry",detail:`${tenantName(organisationId)} trial for ${subscription.plan_code} expires ${new Date(expiry).toISOString()}.`,resource_type:"subscription",resource_ref:String(subscription.id),href:organisationId?`/founder/tenants/${organisationId}`:"/founder",metadata:{planCode:subscription.plan_code,trialEndsAt:subscription.trial_ends_at}});
        }
      }
      if(subscription.status==="active" && subscription.current_period_ends_at){
        const renewal=Date.parse(String(subscription.current_period_ends_at));
        if(Number.isFinite(renewal)&&renewal>=now&&renewal<=thirtyDays){
          alerts.push({dedupe_key:`renewal-approaching:${subscription.id}:${subscription.current_period_ends_at}`,organisation_id:organisationId,alert_type:"renewal_approaching",severity:"info",title:"Subscription renewal approaching",detail:`${tenantName(organisationId)} ${subscription.plan_code} subscription renews ${new Date(renewal).toISOString()}.`,resource_type:"subscription",resource_ref:String(subscription.id),href:organisationId?`/founder/tenants/${organisationId}`:"/founder",metadata:{planCode:subscription.plan_code,renewalAt:subscription.current_period_ends_at}});
        }
      }
    }
    for(const invoice of rows(invoicesResult.data).filter((item)=>customerOrganisationIds.has(String(item.organisation_id))&&item.is_overdue===true&&BigInt(String(item.outstanding_minor ?? 0))>0n)){
      alerts.push({dedupe_key:`invoice-overdue:${invoice.id}`,organisation_id:invoice.organisation_id,alert_type:"invoice_overdue",severity:"critical",title:"Invoice overdue",detail:`${tenantName(invoice.organisation_id)} invoice ${invoice.invoice_number} has ${invoice.currency} ${invoice.outstanding_minor} outstanding.`,resource_type:"invoice",resource_ref:String(invoice.id),href:"/founder/billing",metadata:{invoiceNumber:invoice.invoice_number,currency:invoice.currency,outstandingMinor:String(invoice.outstanding_minor),dueAt:invoice.due_at}});
    }
    for(const payment of rows(paymentsResult.data).filter((item)=>customerOrganisationIds.has(String(item.organisation_id)))){
      alerts.push({dedupe_key:`payment-failed:${payment.id}`,organisation_id:payment.organisation_id,alert_type:"payment_failed",severity:"warning",title:"Payment failed",detail:`${tenantName(payment.organisation_id)} payment attempt through ${payment.provider} failed.`,resource_type:"payment",resource_ref:String(payment.id),href:"/founder/billing",metadata:{currency:payment.currency,amountMinor:String(payment.amount_minor),createdAt:payment.created_at}});
    }
    for(const run of rows(reconciliationResult.data).filter((item)=>customerOrganisationIds.has(String(item.organisation_id)))){
      alerts.push({dedupe_key:`reconciliation-exception:${run.id}`,organisation_id:run.organisation_id,alert_type:"reconciliation_exception",severity:"critical",title:"Payment reconciliation exception",detail:`${tenantName(run.organisation_id)} has an unresolved ${run.currency} reconciliation discrepancy (${run.source_ref}).`,resource_type:"reconciliation_run",resource_ref:String(run.id),href:"/founder/billing",metadata:{currency:run.currency,sourceRef:run.source_ref}});
    }
    for(const decision of rows(decisionsResult.data).filter((item)=>customerOrganisationIds.has(String(item.organisation_id)))){
      alerts.push({dedupe_key:`entitlement-exception:${decision.id}`,organisation_id:decision.organisation_id,alert_type:"entitlement_exception",severity:"warning",title:"Entitlement requires commercial review",detail:`${tenantName(decision.organisation_id)} feature ${decision.feature_code} requires founder review: ${decision.reason}.`,resource_type:"entitlement_decision",resource_ref:String(decision.id),href:"/founder/entitlements",metadata:{featureCode:decision.feature_code,outcome:decision.outcome,decidedAt:decision.decided_at}});
    }
    let insertedCount=0;
    if(alerts.length){
      const {data:inserted,error}=await admin.from("commercial_founder_notifications").upsert(alerts,{onConflict:"dedupe_key",ignoreDuplicates:true}).select("id");
      if(error) throw new Error("Founder commercial notifications could not be persisted.");
      insertedCount=Array.isArray(inserted)?inserted.length:0;
      if(insertedCount) await writeFounderNotificationAudit(admin,actor,"founder_notifications.synced","platform");
    }
    return { generated: alerts.length, inserted: insertedCount };
  });

export const listFounderCommercialNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const {data,error}=await admin.from("commercial_founder_notifications").select("*").order("created_at",{ascending:false}).limit(300);
    if(error) throw new Error("Founder commercial notifications could not be loaded.");
    return JSON.parse(JSON.stringify(rows(data)));
  });

export const acknowledgeFounderCommercialNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => founderNotificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor=await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const {data:notification,error}=await admin.from("commercial_founder_notifications").select("id,status").eq("id",data.notificationId).maybeSingle();
    if(error||!notification) throw new Error("Founder notification was not found.");
    if(notification.status==="open"){
      const {error:updateError}=await admin.from("commercial_founder_notifications").update({status:"acknowledged",acknowledged_at:new Date().toISOString(),acknowledged_by:actor.userId}).eq("id",data.notificationId);
      if(updateError) throw new Error("Founder notification acknowledgement failed.");
      await writeFounderNotificationAudit(admin,actor,"founder_notification.acknowledged",data.notificationId);
    }
    return {id:data.notificationId,status:notification.status==="open"?"acknowledged":notification.status};
  });

export const resolveFounderCommercialNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => founderNotificationInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor=await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const {data:notification,error}=await admin.from("commercial_founder_notifications").select("id,status").eq("id",data.notificationId).maybeSingle();
    if(error||!notification) throw new Error("Founder notification was not found.");
    if(notification.status!=="resolved"){
      const {error:updateError}=await admin.from("commercial_founder_notifications").update({status:"resolved",resolved_at:new Date().toISOString(),resolved_by:actor.userId}).eq("id",data.notificationId);
      if(updateError) throw new Error("Founder notification resolution failed.");
      await writeFounderNotificationAudit(admin,actor,"founder_notification.resolved",data.notificationId);
    }
    return {id:data.notificationId,status:"resolved" as const};
  });

export const listFounderCommercialAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const [commercial, financial, subscriptions] = await Promise.all([
      admin.from("commercial_audit_events").select("*").order("occurred_at",{ascending:false}).limit(500),
      admin.from("commercial_financial_audit_events").select("*").order("occurred_at",{ascending:false}).limit(500),
      admin.from("commercial_subscription_events").select("*").order("occurred_at",{ascending:false}).limit(500),
    ]);
    if(commercial.error||financial.error||subscriptions.error) throw new Error("Founder commercial audit history could not be loaded.");
    const events: Row[]=[
      ...rows(commercial.data).map((event): Row => ({...event,audit_source:"commercial"})),
      ...rows(financial.data).map((event): Row => ({...event,audit_source:"financial"})),
      ...rows(subscriptions.data).map((event)=>({
        ...event,
        action:event.event_type,
        resource_type:"subscription",
        resource_ref:event.subscription_id,
        outcome:"succeeded",
        occurred_at:event.occurred_at,
        metadata:event.event_metadata,
        audit_source:"subscription",
      })),
    ];
    events.sort((a,b)=>Date.parse(String(b.occurred_at??""))-Date.parse(String(a.occurred_at??"")));
    return JSON.parse(JSON.stringify(events));
  });


const founderAccountRegistrationInput = z.object({
  organisationId: z.string().uuid(),
  contactName: z.string().trim().min(2).max(120),
  contactEmail: z.string().trim().email().max(255),
  contactPhone: z.string().trim().max(40).nullable().optional(),
  contactRole: z.enum(["primary","billing","technical","finance"]),
  reasonCode: z.string().trim().min(2).max(200),
  idempotencyKey: z.string().trim().min(8).max(200),
});

export const registerFounderCommercialAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => founderAccountRegistrationInput.parse(input))
  .handler(async ({ data, context }) => {
    const actor=await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const {data:result,error}=await admin.rpc("commercial_register_account",{
      _organisation_id:data.organisationId,_contact_name:data.contactName,_contact_email:data.contactEmail,
      _contact_phone:data.contactPhone??null,_contact_role:data.contactRole,_reason_code:data.reasonCode,
      _idempotency_key:data.idempotencyKey,_actor_user_id:actor.userId,_actor_organisation_id:actor.organisationId,
    });
    if(error||!result?.accountId) throw new Error("Commercial account registration was not confirmed by the founder registration service.");
    return {accountId:String(result.accountId),organisationId:data.organisationId,replayed:result.replayed===true};
  });

async function loadFounderSubscriptionPolicies(admin: SupabaseAdminClient) {
  const {data:currentRows,error:currentError}=await admin.from("commercial_policy_config_current")
    .select("policy_type,version_id").in("policy_type",["catalogue","pricing","composition"]);
  if(currentError) throw new Error("Published commercial policy pointers could not be loaded.");
  const current=rows(currentRows);
  const payloads:Record<string,unknown>={};
  for(const policyType of ["catalogue","pricing","composition"]){
    const pointer=current.find((item)=>item.policy_type===policyType);
    if(!pointer?.version_id) throw new Error(`Published ${policyType} policy is required before assigning a subscription.`);
    const {data:version,error}=await admin.from("commercial_policy_config_versions").select("id,status,payload,version,effective_from,effective_to")
      .eq("id",pointer.version_id).maybeSingle();
    if(error||!version||version.status!=="published") throw new Error(`Published ${policyType} policy version could not be verified.`);
    payloads[policyType]=validateFounderPolicyPayload(policyType as "catalogue"|"pricing"|"composition",version.payload,"published");
  }
  return payloads as {
    catalogue: {plans:Array<{code:string;name:string;status:string}>;planVersions:Array<{planCode:string;version:number;status:string;effectiveFrom:string|null;effectiveTo:string|null}>;addons:Array<{code:string;name:string;status:string}>};
    pricing: {planPrices:Array<{priceCode:string;planCode:"essential"|"professional"|"enterprise";planVersion:number;currency:"TZS"|"USD";billingTerm:"monthly"|"annual";priceMode:"fixed"|"quote_required";baseAmountMinor:number|null;includedProperties:number|null;additionalPropertyAmountMinor:number|null;status:"draft"|"active"|"retired";effectiveFrom:string|null;effectiveTo:string|null}>;addonPrices:Array<{priceCode:string;addonCode:string;currency:"TZS"|"USD";billingTerm:"monthly"|"annual";chargeModel:"flat"|"per_property";amountMinor:number;status:"draft"|"active"|"retired";effectiveFrom:string|null;effectiveTo:string|null}>};
    composition: {compositions:Array<{planCode:string;planVersion:number;status:string;moduleCodes:string[];addonCodes:string[];effectiveFrom:string|null;effectiveTo:string|null}>;compatibilityRules:Array<{addonCode:string;requiresModuleCodes:string[];conflictsWithAddonCodes:string[]}>};
  };
}

export const getFounderSubscriptionSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({context})=>{
    await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const policies=await loadFounderSubscriptionPolicies(admin);
    const today=new Date().toISOString().slice(0,10);
    const planVersions=policies.catalogue.planVersions.filter(v=>v.status==="published"&&(!v.effectiveFrom||v.effectiveFrom<=today)&&(!v.effectiveTo||v.effectiveTo>=today));
    const plans=policies.catalogue.plans.filter(p=>p.status==="published");
    const prices=policies.pricing.planPrices.filter(p=>p.status==="active"&&(!p.effectiveFrom||p.effectiveFrom<=today)&&(!p.effectiveTo||p.effectiveTo>=today));
    const addons=policies.catalogue.addons.filter(addon=>addon.status==="published");
    const addonPrices=policies.pricing.addonPrices.filter(price=>price.status==="active"&&(!price.effectiveFrom||price.effectiveFrom<=today)&&(!price.effectiveTo||price.effectiveTo>=today));
    return JSON.parse(JSON.stringify({plans,planVersions,prices,addons,addonPrices,composition:policies.composition.compositions}));
  });

const createFounderSubscriptionInput=z.object({
  accountId:z.string().uuid(),
  planCode:z.enum(["essential","professional","enterprise"]),
  planVersion:z.number().int().positive(),
  currency:z.enum(["TZS","USD"]),
  billingTerm:z.enum(["monthly","annual"]),
  propertyCount:z.number().int().positive(),
  addonCodes:z.array(z.string().trim().min(2).max(60)).max(30).default([]),
  reasonCode:z.string().trim().min(2).max(200),
  idempotencyKey:z.string().trim().min(8).max(200),
});

export const createFounderCommercialSubscription = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>createFounderSubscriptionInput.parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const {data:account,error:accountError}=await admin.from("commercial_accounts").select("id,status").eq("id",data.accountId).maybeSingle();
    if(accountError||!account||account.status!=="active") throw new Error("An active commercial customer account is required.");
    const policies=await loadFounderSubscriptionPolicies(admin);
    const today=new Date().toISOString().slice(0,10);
    const plan=policies.catalogue.plans.find(p=>p.code===data.planCode&&p.status==="published");
    const planVersion=policies.catalogue.planVersions.find(v=>v.planCode===data.planCode&&v.version===data.planVersion&&v.status==="published"&&(!v.effectiveFrom||v.effectiveFrom<=today)&&(!v.effectiveTo||v.effectiveTo>=today));
    const composition=policies.composition.compositions.find(c=>c.planCode===data.planCode&&c.planVersion===data.planVersion&&c.status==="published"&&(!c.effectiveFrom||c.effectiveFrom<=today)&&(!c.effectiveTo||c.effectiveTo>=today));
    if(!plan||!planVersion||!composition) throw new Error("The selected plan version is not active in the published catalogue and package composition.");
    const selectedAddons=[...new Set(data.addonCodes)];
    if(selectedAddons.length!==data.addonCodes.length) throw new Error("An add-on may only be selected once.");
    const activeAddonCodes=new Set(policies.catalogue.addons.filter(addon=>addon.status==="published").map(addon=>addon.code));
    if(selectedAddons.some(code=>!activeAddonCodes.has(code))) throw new Error("One or more selected add-ons are not active in the published catalogue.");
    const effectiveComposition={
      ...composition,
      addonCodes:[...new Set([...composition.addonCodes,...selectedAddons])],
    } as Parameters<typeof validatePackageComposition>[0];
    const compositionValidation=validatePackageComposition(
      effectiveComposition,
      policies.composition.compatibilityRules as Parameters<typeof validatePackageComposition>[1],
    );
    if(!compositionValidation.valid) throw new Error(`Selected add-ons violate the published package composition: ${compositionValidation.issues.map(issue=>issue.code).join(", ")}.`);
    const bundledAddons=new Set(composition.addonCodes);
    const pricedAddons=selectedAddons.filter(code=>!bundledAddons.has(code));
    const price=resolveCommercialPrice({
      planCode:data.planCode,planVersion:data.planVersion,currency:data.currency,billingTerm:data.billingTerm,
      propertyCount:data.propertyCount,asOf:today,addons:pricedAddons.map(addonCode=>({addonCode})),
    },policies.pricing.planPrices,policies.pricing.addonPrices);
    if(!price.quoteRequired && price.totalAmountMinor===null) throw new Error("Fixed-price resolution returned no total.");
    const acceptedPriceSnapshot={
      currency:price.currency,planCode:price.planCode,planVersion:price.planVersion,billingTerm:price.billingTerm,
      propertyCount:price.propertyCount,priceCode:price.planPriceCode,asOf:price.asOf,quoteRequired:price.quoteRequired,
      ...(price.quoteRequired?{lineItems:[]}:{total:price.totalAmountMinor,lineItems:price.lines}),
      addonCodes:selectedAddons,
    };
    const priceResolutionRef=`cc06-${globalThis.crypto.randomUUID()}`;
    const {data:result,error}=await admin.rpc("commercial_create_subscription_for_founder",{
      _account_id:data.accountId,_plan_code:data.planCode,_plan_version:data.planVersion,
      _currency:data.currency,_billing_term:data.billingTerm,_property_count:data.propertyCount,
      _addon_codes:selectedAddons,_price_resolution_ref:priceResolutionRef,_accepted_price_snapshot:acceptedPriceSnapshot,
      _quote_required:price.quoteRequired,_idempotency_key:data.idempotencyKey,_reason_code:data.reasonCode,
      _actor_user_id:actor.userId,_actor_organisation_id:actor.organisationId,
    });
    if(error||!result?.subscriptionId) throw new Error("Subscription creation was not confirmed by the CC-03 founder registration service.");
    return {subscriptionId:String(result.subscriptionId),replayed:result.replayed===true,quoteRequired:price.quoteRequired,price:acceptedPriceSnapshot};
  });


const replaceFounderSubscriptionInput = z.object({
  subscriptionId:z.string().uuid(),
  planCode:z.enum(["essential","professional","enterprise"]),
  planVersion:z.number().int().positive(),
  billingTerm:z.enum(["monthly","annual"]),
  propertyCount:z.number().int().positive(),
  addonCodes:z.array(z.string().trim().min(2).max(60)).max(30).default([]),
  commercialAcceptanceRef:z.string().trim().min(1).max(300),
  financialAdjustmentRef:z.string().trim().min(1).max(300),
  periodEndsAt:z.string().datetime({offset:true}),
  reasonCode:z.string().trim().min(2).max(200),
  idempotencyKey:z.string().trim().min(8).max(170),
});

/**
 * Founder-authorized replacement of an active fixed-price subscription.
 * The old immutable snapshot is closed and a new accepted snapshot activated
 * in one database transaction. The separately posted invoice adjustment is
 * referenced, never created or modified by this operation.
 */
export const replaceFounderCommercialSubscription = createServerFn({method:"POST"})
  .middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>replaceFounderSubscriptionInput.parse(input))
  .handler(async({data,context})=>{
    const actor=await resolveVerifiedFounderActor(context as {supabase:unknown;userId:string});
    const {supabaseAdmin}=await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin=supabaseAdmin as any;
    const {data:old,error:oldError}=await admin.from("commercial_subscriptions")
      .select("id,account_id,status,currency,quote_required,current_period_ends_at")
      .eq("id",data.subscriptionId).maybeSingle();
    if(oldError||!old||old.status!=="active"||old.quote_required===true) {
      throw new Error("Only an active fixed-price subscription can be replaced through this workflow.");
    }
    const policies=await loadFounderSubscriptionPolicies(admin);
    const today=new Date().toISOString().slice(0,10);
    const plan=policies.catalogue.plans.find(p=>p.code===data.planCode&&p.status==="published");
    const planVersion=policies.catalogue.planVersions.find(v=>v.planCode===data.planCode&&v.version===data.planVersion&&v.status==="published"&&(!v.effectiveFrom||v.effectiveFrom<=today)&&(!v.effectiveTo||v.effectiveTo>=today));
    const composition=policies.composition.compositions.find(c=>c.planCode===data.planCode&&c.planVersion===data.planVersion&&c.status==="published"&&(!c.effectiveFrom||c.effectiveFrom<=today)&&(!c.effectiveTo||c.effectiveTo>=today));
    if(!plan||!planVersion||!composition) throw new Error("The selected plan version is not active in the published catalogue and package composition.");
    const selectedAddons=[...new Set(data.addonCodes)];
    if(selectedAddons.length!==data.addonCodes.length) throw new Error("An add-on may only be selected once.");
    const activeAddonCodes=new Set(policies.catalogue.addons.filter(addon=>addon.status==="published").map(addon=>addon.code));
    if(selectedAddons.some(code=>!activeAddonCodes.has(code))) throw new Error("One or more selected add-ons are not active in the published catalogue.");
    const effectiveComposition={
      ...composition,addonCodes:[...new Set([...composition.addonCodes,...selectedAddons])],
    } as Parameters<typeof validatePackageComposition>[0];
    const validation=validatePackageComposition(
      effectiveComposition,policies.composition.compatibilityRules as Parameters<typeof validatePackageComposition>[1],
    );
    if(!validation.valid) throw new Error(`Selected add-ons violate the published package composition: ${validation.issues.map(issue=>issue.code).join(", ")}.`);
    const bundledAddons=new Set(composition.addonCodes);
    const pricedAddons=selectedAddons.filter(code=>!bundledAddons.has(code));
    const price=resolveCommercialPrice({
      planCode:data.planCode,planVersion:data.planVersion,currency:old.currency,billingTerm:data.billingTerm,
      propertyCount:data.propertyCount,asOf:today,addons:pricedAddons.map(addonCode=>({addonCode})),
    },policies.pricing.planPrices,policies.pricing.addonPrices);
    if(price.quoteRequired||price.totalAmountMinor===null) {
      throw new Error("Revenue movement requires a fixed-price accepted snapshot. Quote-only Enterprise changes require a separately reviewed commercial agreement.");
    }
    const acceptedPriceSnapshot={
      currency:price.currency,planCode:price.planCode,planVersion:price.planVersion,billingTerm:price.billingTerm,
      propertyCount:price.propertyCount,priceCode:price.planPriceCode,asOf:price.asOf,quoteRequired:false,
      total:price.totalAmountMinor,lineItems:price.lines,addonCodes:selectedAddons,
    };
    const priceResolutionRef=`cc07-${globalThis.crypto.randomUUID()}`;
    const {data:result,error}=await admin.rpc("commercial_replace_active_subscription_for_founder",{
      _old_subscription_id:data.subscriptionId,_plan_code:data.planCode,_plan_version:data.planVersion,
      _currency:old.currency,_billing_term:data.billingTerm,_property_count:data.propertyCount,
      _addon_codes:selectedAddons,_price_resolution_ref:priceResolutionRef,
      _accepted_price_snapshot:acceptedPriceSnapshot,
      _commercial_acceptance_ref:data.commercialAcceptanceRef,
      _financial_adjustment_ref:data.financialAdjustmentRef,
      _period_ends_at:data.periodEndsAt,_idempotency_key:data.idempotencyKey,
      _reason_code:data.reasonCode,_actor_user_id:actor.userId,_actor_organisation_id:actor.organisationId,
    });
    if(error||!result?.subscriptionId) throw new Error("Accepted subscription replacement and revenue movement could not be committed.");
    return {...result,price:acceptedPriceSnapshot};
  });
