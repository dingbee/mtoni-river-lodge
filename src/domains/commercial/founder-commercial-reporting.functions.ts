import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolveVerifiedFounderActor } from "./subscription.functions";

type Currency = "TZS" | "USD";
type Money = Record<Currency, string>;
type Row = Record<string, unknown>;

const currencies: Currency[] = ["TZS", "USD"];
const emptyMoney = (): Record<Currency, bigint> => ({ TZS: 0n, USD: 0n });
const asMinor = (value: unknown): bigint => {
  if (value === null || value === undefined || value === "") return 0n;
  const raw = String(value);
  if (!/^-?\\d+$/.test(raw)) throw new Error("A financial amount is not an integer minor-unit value.");
  return BigInt(raw);
};
const asMoney = (value: Record<Currency, bigint>): Money => ({
  TZS: value.TZS.toString(), USD: value.USD.toString(),
});
const currencyOf = (value: unknown): Currency | null =>
  value === "TZS" || value === "USD" ? value : null;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readAll(admin: any, table: string, select: string, configure: (query: any) => any): Promise<Row[]> {
  const result: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const query = configure(admin.from(table).select(select)).range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error(`Founder commercial report could not load ${table} facts.`);
    const page = rows(data);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

/**
 * Founder-only reporting projection. All NUMERIC(20,0) values cross the
 * database boundary as text and are aggregated with BigInt. TZS and USD
 * remain independent ledgers; this projection never applies FX.
 */
export const getFounderCommercialReporting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    currency: z.enum(["TZS", "USD"]).optional(),
    organisationId: z.string().uuid().optional(),
  }).refine((value) => Date.parse(value.periodEnd) > Date.parse(value.periodStart), {
    message: "Report period end must be after period start.", path: ["periodEnd"],
  }).parse(input))
  .handler(async ({ data, context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: founderConfig, error: founderConfigError } = await admin
      .from("commercial_founder_tenant_config").select("founder_organisation_id")
      .eq("singleton", true).maybeSingle();
    if (founderConfigError || !founderConfig?.founder_organisation_id) {
      throw new Error("Founder tenant boundary configuration is unavailable.");
    }
    let organisationQuery = admin.from("staynas_organisations").select("id,name")
      .neq("id", founderConfig.founder_organisation_id);
    if (data.organisationId) organisationQuery = organisationQuery.eq("id", data.organisationId);
    const { data: organisationData, error: organisationError } = await organisationQuery;
    if (organisationError) throw new Error("Customer tenant reporting scope could not be loaded.");
    const organisations = rows(organisationData);
    const organisationIds = organisations.map((item) => String(item.id));
    if (data.organisationId && !organisationIds.includes(data.organisationId)) {
      throw new Error("Requested customer tenant was not found.");
    }

    const zero = asMoney(emptyMoney());
    if (!organisationIds.length) {
      return {
        generatedAt: new Date().toISOString(), periodStart: data.periodStart, periodEnd: data.periodEnd,
        currencyScope: data.currency ?? "all",
        tenantOptions: organisations.map((item) => ({ id: String(item.id), name: String(item.name ?? "Customer tenant") })),
        totals: {
          grossInvoiced: zero, invoiced: zero, oneTime: zero, credits: zero, debits: zero,
          writeOffs: zero, collected: zero, reversed: zero, outstanding: zero, unallocated: zero,
          mrr: zero, arr: zero, arpt: zero, newMrr: zero, expansionMrr: zero,
          contractionMrr: zero, churnedMrr: zero, netNewMrr: zero,
        },
        receivablesAging: { current: zero, days1To30: zero, days31To60: zero, days61To90: zero, over90: zero },
        counts: { invoices: 0, collections: 0, activeSubscriptions: 0, overdueInvoices: 0 },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currencyFilter = (query: any) => data.currency ? query.eq("currency", data.currency) : query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orgFilter = (query: any) => query.in("organisation_id", organisationIds);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const periodFilter = (query: any) => currencyFilter(orgFilter(
      query.gte("period_month", data.periodStart).lt("period_month", data.periodEnd),
    ));
    const [invoiceFacts, collectionFacts, unallocatedFacts, reversalFacts, receivables, recurringFacts, movementFacts] = await Promise.all([
      readAll(admin, "commercial_founder_revenue_invoice_facts",
        "organisation_id,account_id,invoice_id,period_month,currency,gross_invoiced_minor,net_invoiced_minor,one_time_minor,credit_notes_minor,debit_notes_minor,write_offs_minor,outstanding_minor,credit_balance_minor",
        (query) => periodFilter(query).order("organisation_id").order("period_month").order("invoice_id")),
      readAll(admin, "commercial_founder_revenue_collection_facts",
        "organisation_id,account_id,invoice_id,payment_id,period_month,currency,net_collected_minor",
        (query) => periodFilter(query).order("organisation_id").order("period_month").order("payment_id")),
      readAll(admin, "commercial_founder_revenue_unallocated_facts",
        "organisation_id,account_id,period_month,currency,unallocated_minor",
        (query) => periodFilter(query).order("organisation_id").order("period_month").order("account_id").order("currency")),
      readAll(admin, "commercial_founder_revenue_reversal_facts",
        "organisation_id,account_id,period_month,currency,reversed_minor,reversal_count",
        (query) => periodFilter(query).order("organisation_id").order("period_month").order("account_id").order("currency")),
      readAll(admin, "commercial_founder_receivables_aging",
        "invoice_id,organisation_id,currency,outstanding_minor,aging_bucket,status",
        (query) => {
          let scoped = orgFilter(query).gt("outstanding_minor", 0);
          if (data.currency) scoped = scoped.eq("currency", data.currency);
          return scoped.order("organisation_id").order("invoice_id");
        }),
      readAll(admin, "commercial_subscription_recurring_value_facts",
        "subscription_id,account_id,organisation_id,currency,contract_total_minor,mrr_minor,arr_minor",
        (query) => currencyFilter(orgFilter(query).order("organisation_id").order("account_id").order("subscription_id"))),
      readAll(admin, "commercial_founder_subscription_movement_facts",
        "account_id,organisation_id,subscription_id,effective_at,currency,movement_type,previous_mrr_minor,movement_mrr_minor,net_new_mrr_minor",
        (query) => {
          let scoped = orgFilter(query).gte("effective_at", data.periodStart).lt("effective_at", data.periodEnd);
          if (data.currency) scoped = scoped.eq("currency", data.currency);
          return scoped.order("organisation_id").order("effective_at").order("subscription_id").order("movement_type");
        }),
    ]);

    const grossInvoiced = emptyMoney(), invoiced = emptyMoney(), oneTime = emptyMoney();
    const credits = emptyMoney(), debits = emptyMoney(), writeOffs = emptyMoney();
    const collected = emptyMoney(), reversed = emptyMoney(), unallocated = emptyMoney();
    const aging = {
      current: emptyMoney(), days1To30: emptyMoney(), days31To60: emptyMoney(),
      days61To90: emptyMoney(), over90: emptyMoney(),
    };
    let overdueInvoices = 0;
    for (const item of invoiceFacts) {
      const c = currencyOf(item.currency); if (!c) continue;
      grossInvoiced[c] += asMinor(item.gross_invoiced_minor);
      invoiced[c] += asMinor(item.net_invoiced_minor);
      oneTime[c] += asMinor(item.one_time_minor);
      credits[c] += asMinor(item.credit_notes_minor);
      debits[c] += asMinor(item.debit_notes_minor);
      writeOffs[c] += asMinor(item.write_offs_minor);
    }
    for (const item of collectionFacts) {
      const c = currencyOf(item.currency); if (c) collected[c] += asMinor(item.net_collected_minor);
    }
    for (const item of unallocatedFacts) {
      const c = currencyOf(item.currency); if (c) unallocated[c] += asMinor(item.unallocated_minor);
    }
    for (const item of reversalFacts) {
      const c = currencyOf(item.currency); if (c) reversed[c] += asMinor(item.reversed_minor);
    }
    const receivableOutstanding = emptyMoney();
    for (const item of receivables) {
      const c = currencyOf(item.currency); if (!c) continue;
      const amount = asMinor(item.outstanding_minor);
      receivableOutstanding[c] += amount;
      if (item.aging_bucket !== "current" && item.aging_bucket !== "not_due") overdueInvoices++;
      const bucket = item.aging_bucket === "current" ? "current"
        : item.aging_bucket === "1_30" ? "days1To30"
        : item.aging_bucket === "31_60" ? "days31To60"
        : item.aging_bucket === "61_90" ? "days61To90"
        : item.aging_bucket === "over_90" ? "over90" : null;
      if (bucket) aging[bucket][c] += amount;
    }

    const mrr = emptyMoney(), arr = emptyMoney(), arpt = emptyMoney();
    const activeAccounts = { TZS: new Set<string>(), USD: new Set<string>() };
    for (const item of recurringFacts) {
      const c = currencyOf(item.currency); if (!c) continue;
      mrr[c] += asMinor(item.mrr_minor);
      arr[c] += asMinor(item.arr_minor);
      activeAccounts[c].add(String(item.account_id));
    }
    for (const c of currencies) {
      if (activeAccounts[c].size) arpt[c] = mrr[c] / BigInt(activeAccounts[c].size);
    }

    const newMrr = emptyMoney(), expansionMrr = emptyMoney(), contractionMrr = emptyMoney();
    const churnedMrr = emptyMoney(), netNewMrr = emptyMoney();
    for (const item of movementFacts) {
      const c = currencyOf(item.currency); if (!c) continue;
      const amount = asMinor(item.movement_mrr_minor);
      const net = asMinor(item.net_new_mrr_minor);
      if (item.movement_type === "new") newMrr[c] += amount;
      else if (item.movement_type === "expansion") expansionMrr[c] += amount;
      else if (item.movement_type === "contraction") contractionMrr[c] += amount;
      else if (item.movement_type === "churned") churnedMrr[c] += amount;
      netNewMrr[c] += net;
    }

    return {
      generatedAt: new Date().toISOString(), periodStart: data.periodStart, periodEnd: data.periodEnd,
      currencyScope: data.currency ?? "all",
      tenantOptions: organisations.map((item) => ({ id: String(item.id), name: String(item.name ?? "Customer tenant") })),
      totals: {
        grossInvoiced: asMoney(grossInvoiced), invoiced: asMoney(invoiced), oneTime: asMoney(oneTime),
        credits: asMoney(credits), debits: asMoney(debits), writeOffs: asMoney(writeOffs),
        collected: asMoney(collected), reversed: asMoney(reversed), outstanding: asMoney(receivableOutstanding),
        unallocated: asMoney(unallocated), mrr: asMoney(mrr), arr: asMoney(arr), arpt: asMoney(arpt),
        newMrr: asMoney(newMrr), expansionMrr: asMoney(expansionMrr),
        contractionMrr: asMoney(contractionMrr), churnedMrr: asMoney(churnedMrr), netNewMrr: asMoney(netNewMrr),
      },
      receivablesAging: {
        current: asMoney(aging.current), days1To30: asMoney(aging.days1To30),
        days31To60: asMoney(aging.days31To60), days61To90: asMoney(aging.days61To90), over90: asMoney(aging.over90),
      },
      counts: {
        invoices: invoiceFacts.length, collections: collectionFacts.length,
        activeSubscriptions: recurringFacts.length, overdueInvoices,
      },
    };
  });

export const recordFounderCommercialReportExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    format: z.enum(["csv", "pdf"]),
    periodStart: z.string().datetime({ offset: true }),
    periodEnd: z.string().datetime({ offset: true }),
    currency: z.enum(["TZS", "USD"]).optional(),
    organisationId: z.string().uuid().optional(),
  }).refine((value) => Date.parse(value.periodEnd) > Date.parse(value.periodStart), {
    message: "Report period end must be after its start.",
  }).parse(input))
  .handler(async ({ data, context }) => {
    const actor = await resolveVerifiedFounderActor(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data: config, error: configError } = await admin.from("commercial_founder_tenant_config")
      .select("founder_organisation_id").eq("singleton", true).maybeSingle();
    if (configError || !config?.founder_organisation_id || config.founder_organisation_id !== actor.organisationId) {
      throw new Error("Founder tenant boundary configuration is unavailable.");
    }
    if (data.organisationId) {
      const { data: customer, error } = await admin.from("staynas_organisations")
        .select("id").eq("id", data.organisationId)
        .neq("id", config.founder_organisation_id).maybeSingle();
      if (error || !customer) throw new Error("Report export tenant is outside the founder customer portfolio.");
    }
    const { error } = await admin.from("commercial_financial_audit_events").insert({
      request_id: globalThis.crypto.randomUUID(),
      actor_user_id: actor.userId,
      actor_organisation_id: actor.organisationId,
      actor_role: "founder_admin",
      action: `commercial_report.exported.${data.format}`,
      resource_type: "commercial_report",
      resource_ref: `${data.periodStart}/${data.periodEnd}`,
      outcome: "succeeded",
      metadata: {
        periodStart: data.periodStart, periodEnd: data.periodEnd,
        currency: data.currency ?? "all", organisationId: data.organisationId ?? null,
      },
    });
    if (error) throw new Error("Commercial report export could not be recorded in the audit ledger.");
    return { recorded: true };
  });
