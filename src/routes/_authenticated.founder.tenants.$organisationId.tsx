import { createFileRoute, redirect } from "@tanstack/react-router";
import { ArrowLeft, Building2, CreditCard, FileText, ShieldCheck } from "lucide-react";
import { getFounderTenantCommercialProfile } from "@/domains/commercial/founder-control-centre.functions";

export const Route = createFileRoute("/_authenticated/founder/tenants/$organisationId")({
  head: () => ({ meta: [{ title: "Tenant Commercial Profile — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: ({ params }) => getFounderTenantCommercialProfile({ data: { organisationId: params.organisationId } }),
  component: TenantCommercialProfile,
});

type TenantProfileData = {
  organisation: Record<string, unknown>;
  account: Record<string, unknown> | null;
  properties: Array<Record<string, unknown>>;
  subscriptions: Array<Record<string, unknown>>;
  subscriptionEvents: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  assignments: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  auditEvents: Array<Record<string, unknown>>;
};
const money = (minor: unknown, currency: unknown) => {
  const code = currency === "USD" ? "USD" : "TZS";
  const value = Number(minor ?? 0);
  return new Intl.NumberFormat("en-TZ", { style: "currency", currency: code, maximumFractionDigits: 2 }).format((Number.isFinite(value) ? value : 0) / 100);
};
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "—";
const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

function TenantCommercialProfile() {
  const profile = Route.useLoaderData() as TenantProfileData;
  const current = profile.subscriptions[0] ?? null;
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10">
    <div className="mx-auto max-w-7xl space-y-7">
      <a href="/founder#tenants" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to Commercial Control Centre</a>
      <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Founder workspace · Tenant profile</p><h1 className="mt-2 text-3xl font-semibold">{profile.organisation.name}</h1><p className="mt-1 text-sm text-muted-foreground">{profile.organisation.slug} · {profile.organisation.id}</p></div>
        <span className="inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs"><ShieldCheck className="size-4" /> Founder-authorized · Read-only</span>
      </header>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Organisation status</p><p className="mt-2 text-xl font-semibold">{label(profile.organisation.status)}</p></article>
        <article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Commercial account</p><p className="mt-2 text-xl font-semibold">{profile.account ? label(profile.account.status) : "Not provisioned"}</p></article>
        <article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Registered properties</p><p className="mt-2 text-xl font-semibold tabular-nums">{profile.properties.length}</p></article>
        <article className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">Subscription records</p><p className="mt-2 text-xl font-semibold tabular-nums">{profile.subscriptions.length}</p></article>
      </section>

      <section className="space-y-3"><div className="flex items-center gap-2"><Building2 className="size-4" /><h2 className="font-semibold">Identity and properties</h2></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Property</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Timezone</th></tr></thead>
          <tbody className="divide-y">{profile.properties.map((p) => <tr key={String(p.id)}><td className="px-4 py-3 font-medium">{String(p.name)}</td><td className="px-4 py-3">{String(p.code ?? p.slug ?? "—")}</td><td className="px-4 py-3">{label(p.status)}</td><td className="px-4 py-3">{String(p.currency ?? "—")}</td><td className="px-4 py-3">{String(p.timezone ?? "—")}</td></tr>)}
          {profile.properties.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No registered properties.</td></tr>}</tbody></table></div>
      </section>

      <section className="space-y-3"><div className="flex items-center gap-2"><CreditCard className="size-4" /><h2 className="font-semibold">Subscription history</h2></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Term / currency</th><th className="px-4 py-3">Properties allowed</th><th className="px-4 py-3">Trial period</th><th className="px-4 py-3">Current period</th></tr></thead>
          <tbody className="divide-y">{profile.subscriptions.map((s) => <tr key={String(s.id)}><td className="px-4 py-3">{label(s.plan_code)} · v{s.plan_version}</td><td className="px-4 py-3">{label(s.status)}</td><td className="px-4 py-3">{String(s.billing_term)} · {String(s.currency)}</td><td className="px-4 py-3">{String(s.property_count)}</td><td className="px-4 py-3">{date(s.trial_started_at)} — {date(s.trial_ends_at)}</td><td className="px-4 py-3">{date(s.current_period_starts_at)} — {date(s.current_period_ends_at)}</td></tr>)}
          {profile.subscriptions.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No subscription history. Commercial account provisioning is outstanding.</td></tr>}</tbody></table></div>
        {current && <div className="rounded-xl border bg-muted/20 p-4 text-sm"><p className="font-medium">Current subscription context</p><p className="mt-1 text-muted-foreground">Add-ons: {Array.isArray(current.addon_codes) && current.addon_codes.length ? current.addon_codes.join(", ") : "None recorded"} · Renewal cancellation: {current.cancel_at_period_end ? "Requested" : "Not requested"}</p></div>}
      </section>

      <section className="space-y-3"><div className="flex items-center gap-2"><FileText className="size-4" /><h2 className="font-semibold">Financial history</h2></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th></tr></thead>
          <tbody className="divide-y">{profile.invoices.map((i) => <tr key={String(i.id)}><td className="px-4 py-3 font-medium">{String(i.invoice_number)}</td><td className="px-4 py-3">{String(i.currency)}</td><td className="px-4 py-3">{money(i.total_minor,i.currency)}</td><td className="px-4 py-3">{money(i.amount_paid_minor,i.currency)}</td><td className="px-4 py-3">{money(i.outstanding_minor,i.currency)}</td><td className="px-4 py-3">{date(i.due_at)}</td><td className="px-4 py-3">{label(i.status)}</td></tr>)}
          {profile.invoices.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No issued invoices.</td></tr>}</tbody></table></div>
        <div className="overflow-x-auto rounded-xl border"><div className="border-b px-4 py-3 font-medium">Payments</div><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Confirmed</th></tr></thead>
          <tbody className="divide-y">{profile.payments.map((p) => <tr key={String(p.id)}><td className="px-4 py-3">{label(p.provider)}</td><td className="px-4 py-3 text-xs">{String(p.provider_transaction_ref ?? "—")}</td><td className="px-4 py-3">{money(p.amount_minor,p.currency)}</td><td className="px-4 py-3">{label(p.status)}</td><td className="px-4 py-3">{date(p.confirmed_at)}</td></tr>)}
          {profile.payments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No payment transactions.</td></tr>}</tbody></table></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-4"><h2 className="font-semibold">Entitlements</h2><div className="mt-3 space-y-2">{profile.assignments.map((a) => <div key={String(a.id)} className="flex items-center justify-between gap-3 border-b pb-2 text-sm"><span>{String(a.feature_code)}</span><span className="text-xs text-muted-foreground">{label(a.source_type)} · {label(a.status)}</span></div>)}{profile.assignments.length===0 && <p className="text-sm text-muted-foreground">No entitlement assignments.</p>}</div></div>
        <div className="rounded-xl border p-4"><h2 className="font-semibold">Enforcement decisions</h2><div className="mt-3 space-y-2">{profile.decisions.slice(0,20).map((d) => <div key={String(d.id)} className="flex items-center justify-between gap-3 border-b pb-2 text-sm"><span>{String(d.feature_code)}</span><span className={d.allowed ? "text-emerald-700" : "text-red-600"}>{d.allowed ? "Allowed" : "Denied"} · {label(d.outcome)}</span></div>)}{profile.decisions.length===0 && <p className="text-sm text-muted-foreground">No entitlement decisions.</p>}</div></div>
      </section>

      <section className="space-y-3"><h2 className="font-semibold">Subscription and commercial events</h2><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Event</th><th className="px-4 py-3">Actor role</th><th className="px-4 py-3">Reason</th></tr></thead>
        <tbody className="divide-y">{[...profile.subscriptionEvents,...profile.auditEvents].sort((a,b)=>Date.parse(String(b.occurred_at ?? b.created_at ?? ""))-Date.parse(String(a.occurred_at ?? a.created_at ?? ""))).map((e,index)=><tr key={String(e.id ?? index)}><td className="px-4 py-3">{date(e.occurred_at ?? e.created_at)}</td><td className="px-4 py-3">{label(e.event_type ?? e.action)}</td><td className="px-4 py-3">{label(e.actor_role)}</td><td className="px-4 py-3 text-xs">{String(e.reason_code ?? e.reason ?? "—")}</td></tr>)}
        {profile.subscriptionEvents.length+profile.auditEvents.length===0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No tenant-specific commercial audit events recorded.</td></tr>}</tbody></table></div></section>
      <footer className="border-t pt-4 text-xs text-muted-foreground">All data is read from the existing commercial architecture. No tenant operational records are modified by viewing this profile.</footer>
    </div>
  </main>;
}
