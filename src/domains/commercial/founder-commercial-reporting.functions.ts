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
  const raw = typeof value === "number" ? String(value) : String(value);
  if (!/^-?\d+$/.test(raw)) throw new Error("A financial amount is not an integer minor-unit value.");
  return BigInt(raw);
};
const asMoney = (value: Record<Currency, bigint>): Money => ({
  TZS: value.TZS.toString(),
  USD: value.USD.toString(),
});
const currencyOf = (value: unknown): Currency | null =>
  value === "TZS" || value === "USD" ? value : null;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

async function readAll(
  admin: any,
  table: string,
  select: string,
  configure: (query: any) => any,
): Promise<Row[]> {
  const result: Row[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const query = configure(admin.from(table).select(select)).range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw new Error("Founder commercial report could not load authoritative financial facts.");
    const page = rows(data);
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

/**
 * Founder-only reporting projection. Monetary values are returned as integer
 * minor-unit strings so NUMERIC(20,0) never passes through IEEE-754 arithmetic.
 * TZS and USD are independent ledgers; this function never applies FX.
 */
export const getFounderCommercialReporting = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    periodStart: z.string().datetime(),
    periodEnd: z.string().datetime(),
    currency: z.enum(["TZS", "USD"]).optional(),
    organisationId: z.string().uuid().optional(),
  }).refine((value) => Date.parse(value.periodEnd) > Date.parse(value.periodStart), {
    message: "Report period end must be after period start.",
    path: ["periodEnd"],
  }).parse(input))
  .handler(async ({ data, context }) => {
    await resolveVerifiedFounderActor(context as { supabase: unknown; userId: string });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { data: founderConfig, error: founderConfigError } = await admin
      .from("commercial_founder_tenant_config")
      .select("founder_organisation_id")
      .eq("singleton", true)
      .maybeSingle();
    if (founderConfigError || !founderConfig?.founder_organisation_id) {
      throw new Error("Founder tenant boundary configuration is unavailable.");
    }

    let organisationQuery = admin.from("staynas_organisations")
      .select("id,name")
      .neq("id", founderConfig.founder_organisation_id);
    if (data.organisationId) organisationQuery = organisationQuery.eq("id", data.organisationId);
    const { data: organisationData, error: organisationError } = await organisationQuery;
    if (organisationError) throw new Error("Customer tenant reporting scope could not be loaded.");
    const organisations = rows(organisationData);
    const organisationIds = organisations.map((item) => String(item.id));
    if (data.organisationId && !organisationIds.includes(data.organisationId)) {
      throw new Error("Requested customer tenant was not found.");
    }
    if (!organisationIds.length) {
      const zero = asMoney(emptyMoney());
      return {
        generatedAt: new Date().toISOString(),
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        currencyScope: data.currency ?? "all",
        totals: { invoiced: zero, collected: zero, outstanding: zero, unallocated: zero, mrr: zero, arr: zero },
        receivablesAging: { current: zero, days1To30: zero, days31To60: zero, days61To90: zero, over90: zero },
        counts: { invoices: 0, collections: 0, activeSubscriptions: 0, overdueInvoices: 0 },
      };
    }

    const currencyFilter = (query: any) => data.currency ? query.eq("currency", data.currency) : query;
    const orgFilter = (query: any) => query.in("organisation_id", organisationIds);
    const periodFilter = (query: any) => currencyFilter(orgFilter(
      query.gte("period_month", data.periodStart).lt("period_month", data.periodEnd),
    ));
    const [invoiceFacts, collectionFacts, unallocatedFacts, receivables, accountResult] = await Promise.all([
      readAll(admin, "commercial_revenue_invoice_facts", "organisation_id,account_id,invoice_id,period_month,currency,net_invoiced_minor,outstanding_minor,credit_balance_minor", (query) => periodFilter(query).order("organisation_id").order("period_month").order("invoice_id")),
      readAll(admin, "commercial_revenue_collection_facts", "organisation_id,account_id,invoice_id,payment_id,period_month,currency,net_collected_minor", (query) => periodFilter(query).order("organisation_id").order("period_month").order("payment_id")),
      readAll(admin, "commercial_revenue_unallocated_facts", "organisation_id,account_id,period_month,currency,unallocated_minor", (query) => periodFilter(query).order("organisation_id").order("period_month").order("account_id")),
      readAll(admin, "commercial_receivables_aging", "invoice_id,organisation_id,currency,outstanding_minor,aging_bucket,status", (query) => {
        let scoped = orgFilter(query).gt("outstanding_minor", 0);
        if (data.currency) scoped = scoped.eq("currency", data.currency);
        return scoped.order("organisation_id").order("invoice_id");
      }),
      admin.from("commercial_accounts").select("id,organisation_id").in("organisation_id", organisationIds),
    ]);
    if (accountResult.error) throw new Error("Commercial account scope could not be loaded.");
    const accountIds = rows(accountResult.data).map((item) => String(item.id));
    const subscriptionResult = accountIds.length
      ? await admin.from("commercial_subscriptions")
        .select("id,account_id,currency,billing_term,status,quote_required,accepted_price_snapshot,current_period_ends_at")
        .in("account_id", accountIds)
        .eq("status", "active")
      : { data: [], error: null };
    if (subscriptionResult.error) throw new Error("Active subscription facts could not be loaded.");

    const invoiced = emptyMoney();
    const collected = emptyMoney();
    const unallocated = emptyMoney();
    const payingAccounts = { TZS: new Set<string>(), USD: new Set<string>() };
    const aging = {
      current: emptyMoney(), days1To30: emptyMoney(), days31To60: emptyMoney(),
      days61To90: emptyMoney(), over90: emptyMoney(),
    };
    for (const item of invoiceFacts) {
      const currency = currencyOf(item.currency);
      if (currency) invoiced[currency] += asMinor(item.net_invoiced_minor);
    }
    for (const item of collectionFacts) {
      const currency = currencyOf(item.currency);
      if (currency) {
        collected[currency] += asMinor(item.net_collected_minor);
        if (asMinor(item.net_collected_minor) > 0n) payingAccounts[currency].add(String(item.account_id));
      }
    }
    for (const item of unallocatedFacts) {
      const currency = currencyOf(item.currency);
      if (currency) unallocated[currency] += asMinor(item.unallocated_minor);
    }
    const receivableOutstanding = emptyMoney();
    let overdueInvoices = 0;
    for (const item of receivables) {
      const currency = currencyOf(item.currency);
      if (!currency) continue;
      const amount = asMinor(item.outstanding_minor);
      receivableOutstanding[currency] += amount;
      if (item.aging_bucket !== "current" && item.aging_bucket !== "not_due") overdueInvoices += 1;
      const bucket = item.aging_bucket === "current" ? "current"
        : item.aging_bucket === "1_30" ? "days1To30"
        : item.aging_bucket === "31_60" ? "days31To60"
        : item.aging_bucket === "61_90" ? "days61To90"
        : item.aging_bucket === "over_90" ? "over90" : null;
      if (bucket) aging[bucket][currency] += amount;
    }

    const mrr = emptyMoney();
    const arr = emptyMoney();
    const arpt = emptyMoney();
    const activeSubscriptions = rows(subscriptionResult.data);
    const currentTime = Date.now();
    for (const subscription of activeSubscriptions) {
      const currency = currencyOf(subscription.currency);
      const periodEnd = Date.parse(String(subscription.current_period_ends_at ?? ""));
      if (!currency || subscription.quote_required === true || !Number.isFinite(periodEnd) || periodEnd <= currentTime) continue;
      const snapshot = subscription.accepted_price_snapshot as Record<string, unknown> | null;
      const total = asMinor(snapshot?.totalAmountMinor ?? snapshot?.total);
      if (total <= 0n) continue;
      if (subscription.billing_term === "monthly") {
        mrr[currency] += total;
        arr[currency] += total * 12n;
      } else if (subscription.billing_term === "annual") {
        mrr[currency] += (total + 6n) / 12n;
        arr[currency] += total;
      }
    }

    for (const currency of currencies) {
      if (payingAccounts[currency].size > 0) arpt[currency] = collected[currency] / BigInt(payingAccounts[currency].size);
    }

    return {
      generatedAt: new Date().toISOString(),
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      currencyScope: data.currency ?? "all",
      totals: {
        invoiced: asMoney(invoiced),
        collected: asMoney(collected),
        outstanding: asMoney(receivableOutstanding),
        unallocated: asMoney(unallocated),
        mrr: asMoney(mrr),
        arr: asMoney(arr),
        arpt: asMoney(arpt),
      },
      receivablesAging: {
        current: asMoney(aging.current),
        days1To30: asMoney(aging.days1To30),
        days31To60: asMoney(aging.days31To60),
        days61To90: asMoney(aging.days61To90),
        over90: asMoney(aging.over90),
      },
      counts: {
        invoices: invoiceFacts.length,
        collections: collectionFacts.length,
        activeSubscriptions: activeSubscriptions.filter((item) => {
          const end = Date.parse(String(item.current_period_ends_at ?? ""));
          return Number.isFinite(end) && end > currentTime && item.quote_required !== true;
        }).length,
        overdueInvoices,
      },
    };
  });
