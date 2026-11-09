import { createFileRoute, redirect } from "@tanstack/react-router";
import { getFounderCommercialReporting } from "@/domains/commercial/founder-commercial-reporting.functions";

type Currency = "TZS" | "USD";
type Money = { TZS: string; USD: string };
type Report = {
  periodStart: string;
  periodEnd: string;
  totals: { invoiced: Money; collected: Money; outstanding: Money; unallocated: Money; mrr: Money; arr: Money };
  receivablesAging: { current: Money; days1To30: Money; days31To60: Money; days61To90: Money; over90: Money };
  counts: { invoices: number; collections: number; activeSubscriptions: number; overdueInvoices: number };
};

export const Route = createFileRoute("/_authenticated/founder/reporting")({
  head: () => ({ meta: [{ title: "Commercial Reporting — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => {
    const now = new Date();
    const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
    return await getFounderCommercialReporting({ data: {
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    } }) as Report;
  },
  component: FounderCommercialReporting,
});

function formatMinor(value: string, currency: Currency) {
  const amount = BigInt(value || "0");
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const major = absolute / 100n;
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const formatted = new Intl.NumberFormat("en-TZ", {
    style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(major);
  return `${negative ? "-" : ""}${formatted}.${fraction}`;
}

function MoneyPair({ value }: { value: Money }) {
  return <div className="grid grid-cols-2 gap-3">
    {(["TZS", "USD"] as Currency[]).map((currency) => <div key={currency}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{currency}</p>
      <p className="font-semibold tabular-nums">{formatMinor(value[currency], currency)}</p>
    </div>)}
  </div>;
}

function ReportCard({ title, value, description }: { title: string; value: Money; description: string }) {
  return <article className="rounded-xl border bg-card p-4">
    <h2 className="text-sm text-muted-foreground">{title}</h2>
    <div className="mt-3"><MoneyPair value={value} /></div>
    <p className="mt-2 text-xs text-muted-foreground">{description}</p>
  </article>;
}

function FounderCommercialReporting() {
  const report = Route.useLoaderData() as Report;
  const dateLabel = (value: string) => new Date(value).toLocaleDateString();
  const aging = [
    ["Current", report.receivablesAging.current],
    ["1–30 days", report.receivablesAging.days1To30],
    ["31–60 days", report.receivablesAging.days31To60],
    ["61–90 days", report.receivablesAging.days61To90],
    [">90 days", report.receivablesAging.over90],
  ] as const;
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Founder workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Commercial Reporting</h1>
          <p className="mt-2 text-sm text-muted-foreground">Currency-separated commercial performance and receivables. No currency conversion is applied.</p>
          <p className="mt-1 text-xs text-muted-foreground">Reporting window: {dateLabel(report.periodStart)} – {dateLabel(report.periodEnd)}</p>
        </div>
        <a href="/founder" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Back to Control Centre</a>
      </header>

      <section className="space-y-3">
        <h2 className="font-semibold">Financial performance</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReportCard title="Net invoiced" value={report.totals.invoiced} description="Issued invoices net of posted credits, debit notes and write-offs" />
          <ReportCard title="Net collected" value={report.totals.collected} description="Allocated collections net of allocation reversals" />
          <ReportCard title="Outstanding receivables" value={report.totals.outstanding} description="Open balances across all customer invoices" />
          <ReportCard title="Unallocated collections" value={report.totals.unallocated} description="Cash received but not allocated; excluded from collected revenue" />
          <ReportCard title="Monthly recurring revenue" value={report.totals.mrr} description="Active paid subscriptions from accepted price snapshots" />
          <ReportCard title="Annual recurring revenue" value={report.totals.arr} description="Annualized recurring contract value from accepted snapshots" />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Receivables aging</h2>
        <div className="overflow-hidden rounded-xl border">
          {aging.map(([label, value]) => <div key={label} className="grid grid-cols-[1fr_2fr] items-center gap-4 border-b p-4 last:border-0">
            <span className="text-sm font-medium">{label}</span>
            <MoneyPair value={value} />
          </div>)}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Invoices</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.counts.invoices}</p></article>
        <article className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Collections</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.counts.collections}</p></article>
        <article className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Active subscriptions</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.counts.activeSubscriptions}</p></article>
        <article className="rounded-xl border p-4"><p className="text-sm text-muted-foreground">Overdue invoices</p><p className="mt-2 text-2xl font-semibold tabular-nums">{report.counts.overdueInvoices}</p></article>
      </section>
      <p className="text-xs text-muted-foreground">All amounts are reported in their original currency and exact integer minor units. MRR/ARR are not blended across TZS and USD.</p>
    </div>
  </main>;
}
