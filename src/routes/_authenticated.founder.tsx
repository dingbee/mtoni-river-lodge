import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, AlertCircle, Building2, CalendarClock, CheckCircle2, CircleDollarSign, CreditCard, FileText, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { getFounderCommercialWorkspace } from "@/domains/commercial/founder-control-centre.functions";

export const Route = createFileRoute("/_authenticated/founder")({
  head: () => ({ meta: [{ title: "Founder Commercial Control Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: () => getFounderCommercialWorkspace(),
  component: FounderWorkspace,
});

const money = (minor: number, currency: "TZS" | "USD") =>
  new Intl.NumberFormat("en-TZ", { style: "currency", currency, maximumFractionDigits: 2 }).format(minor / 100);
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString() : "—";
const label = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Metric({ title, value, detail, icon: Icon }: { title: string; value: string; detail: string; icon: typeof Building2 }) {
  return <article className="rounded-xl border bg-card p-4 shadow-sm">
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{title}</span><Icon className="size-4" /></div>
    <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </article>;
}

function CurrencyMetric({ title, values }: { title: string; values: { TZS: number; USD: number } }) {
  return <article className="rounded-xl border bg-card p-4">
    <p className="text-sm text-muted-foreground">{title}</p>
    <div className="mt-3 grid grid-cols-2 gap-3">
      <div><p className="text-xs text-muted-foreground">TZS</p><p className="font-semibold tabular-nums">{money(values.TZS, "TZS")}</p></div>
      <div><p className="text-xs text-muted-foreground">USD</p><p className="font-semibold tabular-nums">{money(values.USD, "USD")}</p></div>
    </div>
  </article>;
}

function FounderWorkspace() {
  const data = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const tenants = useMemo(() => data.tenants.filter((tenant) => {
    const matches = [tenant.name, tenant.slug, tenant.subscription?.planCode ?? ""].join(" ").toLowerCase().includes(search.toLowerCase());
    return matches && (status === "all" || tenant.status === status || tenant.subscription?.status === status);
  }), [data.tenants, search, status]);
  const m = data.metrics;
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10">
    <div className="mx-auto max-w-[1440px] space-y-8">
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Platform ownership</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Commercial Control Centre</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Platform-wide customer, subscription and financial intelligence. Tenant operational data remains outside this workspace.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#tenants" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Tenant registry</a>
          <a href="#activity" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Audit activity</a>
          <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Founder-authorized</span>
        </div>
      </header>

      <section aria-label="Customer metrics" className="space-y-3">
        <div className="flex items-center gap-2"><Users className="size-4 text-muted-foreground" /><h2 className="font-semibold">Customer portfolio</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric title="Registered tenants" value={String(m.totalTenants)} detail="All registered organisations" icon={Building2} />
          <Metric title="Active tenants" value={String(m.activeTenants)} detail="Organisation status active" icon={CheckCircle2} />
          <Metric title="Trial tenants" value={String(m.trialTenants)} detail="Current trial subscriptions" icon={CalendarClock} />
          <Metric title="Paid subscriptions" value={String(m.paidSubscriptions)} detail="Active subscriptions only" icon={CreditCard} />
          <Metric title="Suspended tenants" value={String(m.suspendedTenants)} detail="Current suspended subscriptions" icon={AlertCircle} />
          <Metric title="Expired subscriptions" value={String(m.expiredSubscriptions)} detail="Persisted expired lifecycle records" icon={FileText} />
          <Metric title="Renewals approaching" value={String(m.renewalsApproaching)} detail="Next 30 days" icon={RefreshCw} />
          <Metric title="Overdue invoices" value={String(m.overdueInvoices)} detail="Persisted receivables marked overdue" icon={AlertCircle} />
        </div>
      </section>

      <section aria-label="Financial performance" className="space-y-3">
        <div className="flex items-center gap-2"><CircleDollarSign className="size-4 text-muted-foreground" /><h2 className="font-semibold">Financial position</h2><span className="text-xs text-muted-foreground">TZS and USD are never combined</span></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <CurrencyMetric title="Monthly recurring revenue (active subscriptions)" values={{ TZS: m.mrrArrByCurrency.TZS.mrrMinor, USD: m.mrrArrByCurrency.USD.mrrMinor }} />
          <CurrencyMetric title="Annual recurring revenue (active subscriptions)" values={{ TZS: m.mrrArrByCurrency.TZS.arrMinor, USD: m.mrrArrByCurrency.USD.arrMinor }} />
          <CurrencyMetric title="Total invoiced" values={m.totalInvoicedByCurrency} />
          <CurrencyMetric title="Collected against invoices" values={m.collectedByCurrency} />
          <CurrencyMetric title="Outstanding receivables" values={m.outstandingByCurrency} />
        </div>
        <p className="text-xs text-muted-foreground">MRR/ARR use active subscription accepted-price snapshots only. Collections reflect invoice receivables allocations; they exclude unallocated funds. Values are displayed from persisted records, not estimates.</p>
      </section>

      <section id="tenants" className="scroll-mt-6 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-semibold">Tenant commercial registry</h2><p className="text-sm text-muted-foreground">Search and inspect customer commercial status.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants or plans" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm sm:w-64" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Tenant / account</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Properties</th><th className="px-4 py-3">Entitlements</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Last payment</th><th className="px-4 py-3">Health</th></tr></thead>
            <tbody className="divide-y">
              {tenants.map((tenant) => <tr key={tenant.id} className="hover:bg-muted/30">
                <td className="px-4 py-3"><p className="font-medium">{tenant.name}</p><p className="text-xs text-muted-foreground">{tenant.slug}</p></td>
                <td className="px-4 py-3">{tenant.subscription ? label(tenant.subscription.planCode) : "Not assigned"}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{tenant.subscription ? label(tenant.subscription.status) : "Not provisioned"}</span></td>
                <td className="px-4 py-3 tabular-nums">{tenant.propertyCount} / {tenant.subscription?.propertyAllowance ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{tenant.entitlementCount} active</td>
                <td className="px-4 py-3 text-xs">{money(tenant.outstandingByCurrency.TZS,"TZS")}<br />{money(tenant.outstandingByCurrency.USD,"USD")}</td>
                <td className="px-4 py-3 text-xs">{tenant.lastPayment ? <>{tenant.lastPayment.currency} {money(tenant.lastPayment.amountMinor, tenant.lastPayment.currency)}<br />{date(tenant.lastPayment.confirmedAt)}</> : "—"}</td>
                <td className="px-4 py-3"><span className={tenant.commercialHealth === "healthy" ? "text-emerald-700" : tenant.commercialHealth === "attention_required" ? "text-red-600" : "text-amber-700"}>{label(tenant.commercialHealth)}</span></td>
              </tr>)}
              {tenants.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No tenants match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Contact details are not shown because no authoritative commercial contact field has been provisioned. Missing subscriptions and accounts are explicitly identified rather than inferred.</p>
      </section>

      <section id="activity" className="scroll-mt-6 space-y-3">
        <div className="flex items-center gap-2"><Activity className="size-4 text-muted-foreground" /><h2 className="font-semibold">Recent commercial activity</h2></div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Resource</th><th className="px-4 py-3">Actor role</th><th className="px-4 py-3">Outcome</th></tr></thead>
            <tbody className="divide-y">{data.recentEvents.map((event, index) => <tr key={String(event.id ?? index)}>
              <td className="px-4 py-3 text-xs">{date(event.occurred_at)}</td><td className="px-4 py-3 font-medium">{label(String(event.action ?? "unknown"))}</td>
              <td className="px-4 py-3 text-xs">{String(event.resource_type ?? "—")} · {String(event.resource_ref ?? "—")}</td>
              <td className="px-4 py-3 text-xs">{label(String(event.actor_role ?? "unknown"))}</td>
              <td className="px-4 py-3 text-xs">{label(String(event.outcome ?? "unknown"))}</td>
            </tr>)}
            {data.recentEvents.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">No commercial audit events have been recorded yet.</td></tr>}</tbody>
          </table>
        </div>
      </section>
      <footer className="border-t pt-4 text-xs text-muted-foreground">Data snapshot: {new Date(data.generatedAt).toLocaleString()} · Founder access verified server-side · Read-only workspace at this implementation stage.</footer>
    </div>
  </main>;
}
