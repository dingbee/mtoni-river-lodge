import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { getDirectBookingAnalytics } from "@/domains/analytics/direct-booking.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/direct-booking")({
  head: () => ({ meta: [{ title: "Performance & Attribution — StayNas" }] }),
  component: Page,
});

type Range = "today" | "yesterday" | "7d" | "30d" | "90d" | "custom";
type Report = {
  funnel?: Record<string, number | null>;
  currencies?: Array<{ currency: string; gross_booking_value: number; confirmed_booking_value: number; amount_paid: number; outstanding: number; refunds: number; provider_reversals: number; net_collected: number }>;
  campaigns?: Array<{ id: string; name: string; slug: string; status: string; views: number; visitors: number; booking_starts: number; quotes: number; reservations: number; paid_bookings: number; net_collected_by_currency: Array<{ currency: string; net_collected: number }> }>;
  acquisition?: Array<{ source: string; medium: string; views: number; visitors: number; booking_starts: number; reservations: number }>;
  permanent_page?: Record<string, number>;
};

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString();
}
function pct(numerator: number, denominator: number) {
  return denominator > 0 ? `${(numerator / denominator * 100).toFixed(1)}%` : "—";
}
function money(value: number, currency: string) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value); }
  catch { return `${currency} ${Math.round(value).toLocaleString()}`; }
}

function Page() {
  const fn = useServerFn(getDirectBookingAnalytics);
  const [range, setRange] = useState<Range>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const customReady = range !== "custom" || (!!customFrom && !!customTo);
  const { data, isLoading, error } = useQuery({
    queryKey: ["direct-booking.analytics", range, customFrom, customTo],
    enabled: customReady,
    queryFn: () => fn({ data: range === "custom" ? { range: "custom", from: customFrom, to: customTo } : { range } }),
  });
  if (isLoading) return <LoadingState />;
  if (error || !data) return <div className="space-y-4"><PageHeader title="Performance & Attribution" description="Direct booking and campaign conversion evidence." /><p className="rounded-md border p-4 text-sm text-destructive">{error instanceof Error ? error.message : "Analytics could not be loaded."}</p></div>;

  const report = data.report as Report;
  const funnel = report.funnel ?? {};
  const currencies = report.currencies ?? [];
  const campaigns = report.campaigns ?? [];
  const acquisition = report.acquisition ?? [];
  const permanent = report.permanent_page ?? {};
  const exportCsv = () => {
    const rows: Array<Array<string | number | null | undefined>> = [
      ["section", "metric", "value", "currency", "detail"],
      ["period", "from", data.period.from, "", data.property.timezone],
      ["period", "to", data.period.to, "", data.property.name],
      ...Object.entries(funnel).map(([key, value]) => ["funnel", key, value as number]),
      ...Object.entries(permanent).map(([key, value]) => ["permanent_page", key, value as number]),
      ...currencies.flatMap((item) => [
        ["revenue", "gross_booking_value", item.gross_booking_value, item.currency],
        ["revenue", "confirmed_booking_value", item.confirmed_booking_value, item.currency],
        ["revenue", "amount_paid", item.amount_paid, item.currency],
        ["revenue", "current_outstanding", item.outstanding, item.currency],
        ["revenue", "refunds", item.refunds, item.currency],
        ["revenue", "provider_reversals", item.provider_reversals, item.currency],
        ["revenue", "net_collected", item.net_collected, item.currency],
      ]),
      ...campaigns.flatMap((item) => [
        ["campaign", "views", item.views, "", item.name],
        ["campaign", "sessions", item.visitors, "", item.name],
        ["campaign", "booking_starts", item.booking_starts, "", item.name],
        ["campaign", "quotes", item.quotes, "", item.name],
        ["campaign", "reservations", item.reservations, "", item.name],
        ["campaign", "paid_bookings", item.paid_bookings, "", item.name],
        ...item.net_collected_by_currency.map((moneyRow) => ["campaign_revenue", "net_collected", moneyRow.net_collected, moneyRow.currency, item.name]),
      ]),
      ...acquisition.map((item) => ["acquisition", "views", item.views, "", item.source + "/" + item.medium]),
      ...acquisition.map((item) => ["acquisition", "reservations", item.reservations, "", item.source + "/" + item.medium]),
    ];
    const csv = rows.map((row) => row.map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "staynas-booking-analytics-" + data.period.from + "-to-" + data.period.to + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const stages = [
    ["Page views", Number(funnel.page_views ?? 0)],
    ["Booking starts", Number(funnel.booking_starts ?? 0)],
    ["Availability searches", Number(funnel.availability_searches ?? 0)],
    ["Quotes generated", Number(funnel.quotes ?? 0)],
    ["Reservations", Number(funnel.reservations ?? 0)],
    ["Confirmed", Number(funnel.confirmed_reservations ?? 0)],
    ["Paid bookings", Number(funnel.paid_bookings ?? 0)],
  ] as const;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance & Attribution" description={`${data.property.name} · ${data.period.from} to ${data.period.to} · Reporting timezone: ${data.property.timezone}`} />
      <div className="flex flex-wrap items-end gap-2">
        {(["today", "yesterday", "7d", "30d", "90d"] as Range[]).map((item) => (
          <button key={item} type="button" onClick={() => setRange(item)} aria-pressed={range === item}
            className={`rounded-md border px-3 py-2 text-sm ${range === item ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>
            {item === "7d" ? "Last 7 days" : item === "30d" ? "Last 30 days" : item === "90d" ? "Last 90 days" : item === "today" ? "Today" : "Yesterday"}
          </button>
        ))}
        <label className="grid gap-1 text-xs text-muted-foreground">From
          <input type="date" value={customFrom} onChange={(event) => { setCustomFrom(event.target.value); if (!event.target.value) setRange("30d"); }} className="rounded-md border bg-background px-2 py-2 text-sm text-foreground" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">To
          <input type="date" value={customTo} onChange={(event) => { setCustomTo(event.target.value); if (!event.target.value) setRange("30d"); }} className="rounded-md border bg-background px-2 py-2 text-sm text-foreground" />
        </label>
        <button type="button" onClick={() => setRange("custom")} disabled={!customFrom || !customTo || customTo < customFrom}
          className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Apply dates</button>
        <button type="button" onClick={exportCsv} className="rounded-md border px-3 py-2 text-sm">Export CSV</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Page views" value={number(funnel.page_views)} />
        <StatCard label="Unique sessions" value={number(funnel.unique_sessions)} />
        <StatCard label="Booking starts" value={number(funnel.booking_starts)} />
        <StatCard label="Quotes generated" value={number(funnel.quotes)} />
        <StatCard label="Reservations created" value={number(funnel.reservations)} />
        <StatCard label="Confirmed reservations" value={number(funnel.confirmed_reservations)} />
        <StatCard label="Paid bookings" value={number(funnel.paid_bookings)} />
        <StatCard label="Visitor-to-paid conversion" value={funnel.paid_rate == null ? "Unavailable" : `${funnel.paid_rate}%`} />
      </div>

      <SectionCard title="Booking conversion funnel">
        <div className="space-y-3">
          {stages.map(([label, value], index) => {
            const previous = index === 0 ? Number(funnel.unique_sessions ?? 0) : stages[index - 1][1];
            const initial = Number(funnel.unique_sessions ?? 0);
            return <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 text-sm">
              <span>{label}</span><strong>{number(value)}</strong>
              <span className="text-muted-foreground">{index === 0 ? pct(value, initial) : pct(value, previous)} step · {pct(value, initial)} overall</span>
            </div>;
          })}
        </div>
      </SectionCard>

      <SectionCard title="Revenue reconciliation by currency">
        <div className="space-y-4 text-sm">
          {currencies.map((row) => <div key={row.currency} className="grid grid-cols-2 gap-3 border-b pb-3 last:border-0 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Currency", row.currency],
              ["Gross booking value", money(Number(row.gross_booking_value), row.currency)],
              ["Confirmed booking value", money(Number(row.confirmed_booking_value), row.currency)],
              ["Amount paid", money(Number(row.amount_paid), row.currency)],
              ["Current outstanding", money(Number(row.outstanding), row.currency)],
              ["Cash refunds", money(Number(row.refunds), row.currency)],
              ["Provider reversals", money(Number(row.provider_reversals), row.currency)],
              ["Net collected", money(Number(row.net_collected), row.currency)],
            ].map(([label, value]) => <div key={label}><div className="text-xs text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>)}
          </div>)}
          {!currencies.length && <p className="text-muted-foreground">No reservation or verified payment evidence in this period. Amounts are not inferred from reservation totals.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Campaign performance">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="py-2">Campaign</th><th>Status</th><th>Views</th><th>Sessions</th><th>Starts</th><th>Quotes</th><th>Reservations</th><th>Paid</th><th>Net collected</th></tr></thead>
            <tbody>{campaigns.map((row) => <tr key={row.id} className="border-b last:border-0">
              <td className="py-2"><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{row.slug}</div></td>
              <td>{row.status}</td><td>{number(row.views)}</td><td>{number(row.visitors)}</td><td>{number(row.booking_starts)}</td><td>{number(row.quotes)}</td><td>{number(row.reservations)}</td><td>{number(row.paid_bookings)}</td><td>{row.net_collected_by_currency.map((item) => money(Number(item.net_collected), item.currency)).join(" · ") || "—"}</td>
            </tr>)}</tbody>
          </table>
          {!campaigns.length && <p className="py-3 text-sm text-muted-foreground">No campaign performance evidence for this period.</p>}
        </div>
      </SectionCard>

      <SectionCard title="Permanent booking page">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {["views","visitors","booking_starts","quotes","reservations","paid_bookings"].map((key) =>
            <div key={key} className="rounded-md border p-3"><div className="text-xs text-muted-foreground">{key.replaceAll("_"," ").replace("visitors", "sessions")}</div><div className="text-xl font-semibold">{number(permanent[key])}</div></div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="Traffic acquisition">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead><tr className="border-b text-muted-foreground"><th className="py-2">Source</th><th>Medium</th><th>Views</th><th>Sessions</th><th>Booking starts</th><th>Reservations</th></tr></thead>
            <tbody>{acquisition.map((row, i) => <tr key={`${row.source}-${row.medium}-${i}`} className="border-b last:border-0">
              <td className="py-2">{row.source}</td><td>{row.medium}</td><td>{number(row.views)}</td><td>{number(row.visitors)}</td><td>{number(row.booking_starts)}</td><td>{number(row.reservations)}</td>
            </tr>)}</tbody>
          </table>
          {!acquisition.length && <p className="py-3 text-sm text-muted-foreground">Traffic acquisition data is not yet available.</p>}
        </div>
      </SectionCard>
      <p className="text-xs text-muted-foreground">Financial figures are grouped by original currency. Paid revenue is based on verified payment events less verified refunds. No exchange-rate conversion is applied.</p>
    </div>
  );
}
