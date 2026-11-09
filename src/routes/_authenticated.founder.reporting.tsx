import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { getFounderCommercialReporting } from "@/domains/commercial/founder-commercial-reporting.functions";

type Currency = "TZS" | "USD";
type Money = { TZS: string; USD: string };
type Report = {
  periodStart: string;
  periodEnd: string;
  currencyScope: string;
  tenantOptions: Array<{id:string;name:string}>;
  totals: { grossInvoiced: Money; invoiced: Money; oneTime: Money; credits: Money; debits: Money; writeOffs: Money; collected: Money; reversed: Money; outstanding: Money; unallocated: Money; mrr: Money; arr: Money; arpt: Money; newMrr: Money; expansionMrr: Money; contractionMrr: Money; churnedMrr: Money; netNewMrr: Money };
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
  const initialReport = Route.useLoaderData() as Report;
  const [report, setReport] = useState(initialReport);
  const [periodStart, setPeriodStart] = useState(initialReport.periodStart.slice(0,10));
  const [periodEnd, setPeriodEnd] = useState(new Date(Date.parse(initialReport.periodEnd)-86400000).toISOString().slice(0,10));
  const [currency, setCurrency] = useState(initialReport.currencyScope);
  const [organisationId, setOrganisationId] = useState("");
  const [filterBusy, setFilterBusy] = useState(false);
  const [filterMessage, setFilterMessage] = useState("");
  const dateLabel = (value: string) => new Date(value).toLocaleDateString();
  const applyFilters = async () => {
    setFilterBusy(true); setFilterMessage("");
    try {
      const start = new Date(`${periodStart}T00:00:00.000Z`);
      const endExclusive = new Date(`${periodEnd}T00:00:00.000Z`);
      endExclusive.setUTCDate(endExclusive.getUTCDate()+1);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(endExclusive.getTime()) || endExclusive <= start) {
        throw new Error("Select a valid report period.");
      }
      const next = await getFounderCommercialReporting({ data: {
        periodStart: start.toISOString(), periodEnd: endExclusive.toISOString(),
        ...(currency === "all" ? {} : { currency: currency as "TZS" | "USD" }),
        ...(organisationId ? { organisationId } : {}),
      } }) as Report;
      setReport(next);
      setFilterMessage("Report refreshed from the selected scope.");
    } catch (error) {
      setFilterMessage(error instanceof Error ? error.message : "Report filters could not be applied.");
    } finally { setFilterBusy(false); }
  };
  const aging = [
    ["Current", report.receivablesAging.current],
    ["1–30 days", report.receivablesAging.days1To30],
    ["31–60 days", report.receivablesAging.days31To60],
    ["61–90 days", report.receivablesAging.days61To90],
    [">90 days", report.receivablesAging.over90],
  ] as const;
  const downloadCsv = () => {
    const lines: string[][] = [["metric", "currency", "amount_minor"]];
    for (const metric of ["grossInvoiced", "invoiced", "oneTime", "credits", "debits", "writeOffs", "collected", "reversed", "outstanding", "unallocated", "mrr", "arr", "arpt", "newMrr", "expansionMrr", "contractionMrr", "churnedMrr", "netNewMrr"] as const) {
      for (const currency of ["TZS", "USD"] as const) lines.push([metric, currency, report.totals[metric][currency]]);
    }
    for (const [bucket, values] of aging) {
      for (const currency of ["TZS", "USD"] as const) lines.push([`aging_${bucket.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`, currency, values[currency]]);
    }
    const csv = lines.map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `staynas-commercial-report-${report.periodStart.slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Founder workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Commercial Reporting</h1>
          <p className="mt-2 text-sm text-muted-foreground">Currency-separated commercial performance and receivables. No currency conversion is applied.</p>
          <p className="mt-1 text-xs text-muted-foreground">Reporting window: {dateLabel(report.periodStart)} – {dateLabel(report.periodEnd)}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <button type="button" onClick={downloadCsv} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Export CSV</button>
          <button type="button" onClick={() => window.print()} className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Print / Save PDF</button>
          <a href="/founder" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Back to Control Centre</a>
        </div>
      </header>

      <section className="rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-muted-foreground">Period start
            <input type="date" value={periodStart} onChange={(event)=>setPeriodStart(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground"/>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Period end
            <input type="date" value={periodEnd} onChange={(event)=>setPeriodEnd(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground"/>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Currency scope
            <select value={currency} onChange={(event)=>setCurrency(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="all">TZS + USD separately</option><option value="TZS">TZS only</option><option value="USD">USD only</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Customer tenant
            <select value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">All customer tenants</option>
              {initialReport.tenantOptions.map((tenant)=><option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}
            </select>
          </label>
          <div className="flex items-end"><button type="button" disabled={filterBusy} onClick={()=>void applyFilters()} className="h-10 w-full rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{filterBusy ? "Refreshing…" : "Apply filters"}</button></div>
        </div>
        {filterMessage && <p role="status" className="mt-3 text-xs text-muted-foreground">{filterMessage}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Financial performance</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReportCard title="Gross invoiced" value={report.totals.grossInvoiced} description="Issued invoice totals before posted adjustments" />
          <ReportCard title="Net invoiced" value={report.totals.invoiced} description="Issued invoices net of posted credits, debit notes and write-offs" />
          <ReportCard title="One-time charges" value={report.totals.oneTime} description="Invoice lines explicitly classified as one-time adjustments or charges" />
          <ReportCard title="Credits" value={report.totals.credits} description="Posted credit notes; write-offs are shown separately" />
          <ReportCard title="Debit notes" value={report.totals.debits} description="Posted debit adjustments" />
          <ReportCard title="Write-offs" value={report.totals.writeOffs} description="Posted receivable write-offs" />
          <ReportCard title="Net collected" value={report.totals.collected} description="Allocated collections net of allocation reversals" />
          <ReportCard title="Payment reversals" value={report.totals.reversed} description="Verified provider/payment reversals, shown separately from allocated net collections" />
          <ReportCard title="Outstanding receivables" value={report.totals.outstanding} description="Open balances across all customer invoices" />
          <ReportCard title="Unallocated collections" value={report.totals.unallocated} description="Cash received but not allocated; excluded from collected revenue" />
          <ReportCard title="Current monthly recurring revenue" value={report.totals.mrr} description="Active paid subscriptions from accepted price snapshots" />
          <ReportCard title="Current annual recurring revenue" value={report.totals.arr} description="Annualized recurring contract value from accepted snapshots" />
          <ReportCard title="Current ARPT" value={report.totals.arpt} description="Current MRR divided by active paid commercial accounts, separately by currency" />
          <ReportCard title="New MRR" value={report.totals.newMrr} description="Paid subscription activations; trials and quote-only contracts are excluded" />
          <ReportCard title="Expansion MRR" value={report.totals.expansionMrr} description="Positive recurring value changes on accepted replacement contracts" />
          <ReportCard title="Contraction MRR" value={report.totals.contractionMrr} description="Absolute value of negative recurring contract changes" />
          <ReportCard title="Churned MRR" value={report.totals.churnedMrr} description="Paid recurring value lost on cancellation or expiry, excluding replaced contracts" />
          <ReportCard title="Net-new MRR" value={report.totals.netNewMrr} description="New + expansion − contraction − churned MRR" />
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
      <p className="text-xs text-muted-foreground">All amounts are reported in their original currency and exact integer minor units. MRR/ARR and revenue movements are not blended across TZS and USD. Expansion and contraction require an accepted replacement subscription and a separately referenced financial adjustment; the reporting engine does not create credits, refunds or FX conversions.</p>
    </div>
  </main>;
}
