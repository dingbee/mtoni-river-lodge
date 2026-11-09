import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, Building2, CalendarClock, CheckCircle2, CircleDollarSign, CreditCard, FileText, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { getFounderCommercialWorkspace, registerFounderCommercialAccount } from "@/domains/commercial/founder-control-centre.functions";
import { administerCommercialSubscription } from "@/domains/commercial/subscription-administration.functions";

type FounderWorkspaceData = {
  generatedAt: string;
  metrics: {
    totalTenants: number; activeTenants: number; trialTenants: number; paidSubscriptions: number;
    suspendedTenants: number; expiredSubscriptions: number; renewalsApproaching: number; overdueInvoices: number;
    totalInvoicedByCurrency: { TZS: number; USD: number };
    collectedByCurrency: { TZS: number; USD: number };
    outstandingByCurrency: { TZS: number; USD: number };
    mrrArrByCurrency: { TZS: { mrrMinor: number; arrMinor: number }; USD: { mrrMinor: number; arrMinor: number } };
  };
  tenants: Array<{
    id: string; slug: string; name: string; status: string; accountId: string | null; propertyCount: number; subscriptionCount: number;
    primaryContact: {contact_name:string;contact_email:string;contact_phone:string|null;contact_role:string}|null;
    subscription: { id: string; planCode: string; status: string; propertyAllowance: number } | null;
    entitlementCount: number; outstandingByCurrency: { TZS: number; USD: number };
    lastPayment: { amountMinor: number; currency: "TZS" | "USD"; confirmedAt: string | null; reference: string | null } | null;
    commercialHealth: string;
  }>;
  subscriptions: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  entitlementAssignments: Array<Record<string, unknown>>;
  entitlementDecisions: Array<Record<string, unknown>>;
  policyVersions: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  recentEvents: Array<Record<string, unknown>>;
};

export const Route = createFileRoute("/_authenticated/founder")({
  head: () => ({ meta: [{ title: "Founder Commercial Control Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => await getFounderCommercialWorkspace() as FounderWorkspaceData,
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

function SubscriptionAction({ subscription }: { subscription: Record<string, unknown> }) {
  const router = useRouter();
  const status = String(subscription.status);
  const commands = status === "suspended" ? ["reinstate", "request_cancellation"] : status === "pending_activation" ? ["activate_paid"] : ["suspend", "request_cancellation", "cancel_immediately", "renewal_authorized"];
  const [command, setCommand] = useState(commands[0]);
  const [reasonCode, setReasonCode] = useState("");
  const [acceptanceRef, setAcceptanceRef] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { setCommand(commands[0]); setConfirmed(false); setReasonCode(""); setAcceptanceRef(""); setPeriodEnd(""); setMessage(""); }, [status]);
  const needsReason = command === "suspend" || command === "request_cancellation" || command === "cancel_immediately";
  const needsConfirmation = needsReason;
  const needsAcceptance = command === "activate_paid" || command === "renewal_authorized";
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (needsConfirmation && !confirmed) return;
    setBusy(true); setMessage("");
    try {
      await administerCommercialSubscription({ data: {
        subscriptionId: String(subscription.id),
        command: command as "activate_paid" | "suspend" | "reinstate" | "request_cancellation" | "cancel_immediately" | "renewal_authorized",
        idempotencyKey: crypto.randomUUID(),
        ...(needsReason ? { reasonCode } : {}),
        ...(needsAcceptance ? { commercialAcceptanceRef: acceptanceRef } : {}),
        ...(command === "activate_paid" ? { periodEndsAt: new Date(periodEnd).toISOString() } : {}),
      }});
      setMessage("Command accepted and persisted.");
      await router.invalidate();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Subscription command failed.");
    } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="min-w-[220px] space-y-2">
    <select aria-label="Subscription action" value={command} onChange={(event) => setCommand(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs">
      {commands.map((item) => <option key={item} value={item}>{label(item)}</option>)}
    </select>
    {needsReason && <input required value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} placeholder="Reason code" className="h-8 w-full rounded-md border bg-background px-2 text-xs" />}
    {needsAcceptance && <input required value={acceptanceRef} onChange={(event) => setAcceptanceRef(event.target.value)} placeholder="Commercial acceptance reference" className="h-8 w-full rounded-md border bg-background px-2 text-xs" />}
    {command === "activate_paid" && <input required type="datetime-local" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs" />}
    {needsConfirmation && <label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={(event)=>setConfirmed(event.target.checked)} className="mt-0.5" /> I confirm this lifecycle action and its commercial consequences.</label>}
    <button type="submit" disabled={busy || (needsConfirmation && !confirmed)} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">{busy ? "Processing…" : "Apply lifecycle command"}</button>
    {message && <p role="status" className="max-w-[260px] text-xs text-muted-foreground">{message}</p>}
  </form>;
}

function FounderWorkspace() {
  const data = Route.useLoaderData() as FounderWorkspaceData;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [registerOpen,setRegisterOpen]=useState(false);
  const [registerOrganisationId,setRegisterOrganisationId]=useState(data.tenants.find((tenant)=>!tenant.accountId)?.id??"");
  const [contactName,setContactName]=useState("");
  const [contactEmail,setContactEmail]=useState("");
  const [contactPhone,setContactPhone]=useState("");
  const [contactRole,setContactRole]=useState<"primary"|"billing"|"technical"|"finance">("billing");
  const [registrationReason,setRegistrationReason]=useState("");
  const [registrationBusy,setRegistrationBusy]=useState(false);
  const [registrationMessage,setRegistrationMessage]=useState("");
  const router=useRouter();
  const unregisteredTenants=data.tenants.filter((tenant)=>!tenant.accountId);
  const registerAccount=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setRegistrationBusy(true);setRegistrationMessage("");
    try{
      await registerFounderCommercialAccount({data:{
        organisationId:registerOrganisationId,contactName,contactEmail,contactPhone:contactPhone||null,
        contactRole,reasonCode:registrationReason,idempotencyKey:crypto.randomUUID(),
      }});
      setRegistrationMessage("Commercial account and contact registered. Existing tenant memberships and property records were not changed.");
      setRegisterOpen(false);setContactName("");setContactEmail("");setContactPhone("");setRegistrationReason("");
      await router.invalidate();
    }catch(error){setRegistrationMessage(error instanceof Error?error.message:"Commercial account registration failed.");}
    finally{setRegistrationBusy(false);}
  };
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
          <a href="/founder/plans" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Plans & pricing</a>
          <a href="/founder/entitlements" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Entitlements</a>
          <a href="/founder/notifications" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Alerts</a>
          <a href="/founder/audit" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Audit & governance</a>
          <a href="#notifications" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Notifications</a>
          <a href="/founder/subscriptions" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Subscriptions</a>
          <a href="/founder/billing" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Billing & collections</a>
          <a href="/founder/reporting" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Commercial reporting</a>
          <a href="#entitlements" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Entitlements</a>
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
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{unregisteredTenants.length} organisation(s) without a commercial account.</p>
          <button type="button" disabled={unregisteredTenants.length===0} onClick={()=>setRegisterOpen(!registerOpen)} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">{registerOpen?"Close registration":"Register commercial customer"}</button>
        </div>
        {registerOpen&&<form onSubmit={registerAccount} className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
          <label className="text-xs font-medium sm:col-span-2">Existing StayNas organisation<select required value={registerOrganisationId} onChange={e=>setRegisterOrganisationId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{unregisteredTenants.map(tenant=><option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}</select></label>
          <label className="text-xs font-medium">Primary contact name<input required minLength={2} maxLength={120} value={contactName} onChange={e=>setContactName(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
          <label className="text-xs font-medium">Primary contact email<input required type="email" value={contactEmail} onChange={e=>setContactEmail(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
          <label className="text-xs font-medium">Contact phone<input value={contactPhone} onChange={e=>setContactPhone(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
          <label className="text-xs font-medium">Contact responsibility<select value={contactRole} onChange={e=>setContactRole(e.target.value as typeof contactRole)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="primary">Primary</option><option value="billing">Billing</option><option value="technical">Technical</option><option value="finance">Finance</option></select></label>
          <label className="text-xs font-medium sm:col-span-2">Commercial registration reason<input required minLength={2} maxLength={200} value={registrationReason} onChange={e=>setRegistrationReason(e.target.value)} placeholder="Approved customer onboarding reference" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
          <div className="flex items-center gap-3 sm:col-span-2"><button type="submit" disabled={registrationBusy||!registerOrganisationId} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{registrationBusy?"Registering…":"Register commercial account"}</button><p className="text-xs text-muted-foreground">Creates only the commercial account and contact record. Does not create users, memberships or properties.</p></div>
        </form>}
        {registrationMessage&&<p role="status" className="text-sm text-muted-foreground">{registrationMessage}</p>}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-semibold">Tenant commercial registry</h2><p className="text-sm text-muted-foreground">Search and inspect customer commercial status.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tenants or plans" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm sm:w-64" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="all">All statuses</option><option value="active">Active</option><option value="trialing">Trialing</option><option value="suspended">Suspended</option><option value="expired">Expired</option></select>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[950px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Tenant / account</th><th className="px-4 py-3">Primary contact</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Subscription</th><th className="px-4 py-3">Properties</th><th className="px-4 py-3">Entitlements</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Last payment</th><th className="px-4 py-3">Health</th></tr></thead>
            <tbody className="divide-y">
              {tenants.map((tenant) => <tr key={tenant.id} className="hover:bg-muted/30">
                <td className="px-4 py-3"><a href={`/founder/tenants/${tenant.id}`} className="font-medium hover:underline">{tenant.name}</a><p className="text-xs text-muted-foreground">{tenant.slug}</p></td>
                <td className="px-4 py-3"><p>{tenant.primaryContact?.contact_name ?? "Not recorded"}</p><p className="text-xs text-muted-foreground">{tenant.primaryContact?.contact_email ?? "No commercial contact"}</p></td>
                <td className="px-4 py-3">{tenant.subscription ? label(tenant.subscription.planCode) : "Not assigned"}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1 text-xs">{tenant.subscription ? label(tenant.subscription.status) : "Not provisioned"}</span></td>
                <td className="px-4 py-3 tabular-nums">{tenant.propertyCount} / {tenant.subscription?.propertyAllowance ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{tenant.entitlementCount} active</td>
                <td className="px-4 py-3 text-xs">{money(tenant.outstandingByCurrency.TZS,"TZS")}<br />{money(tenant.outstandingByCurrency.USD,"USD")}</td>
                <td className="px-4 py-3 text-xs">{tenant.lastPayment ? <>{tenant.lastPayment.currency} {money(tenant.lastPayment.amountMinor, tenant.lastPayment.currency)}<br />{date(tenant.lastPayment.confirmedAt)}</> : "—"}</td>
                <td className="px-4 py-3"><span className={tenant.commercialHealth === "healthy" ? "text-emerald-700" : tenant.commercialHealth === "attention_required" ? "text-red-600" : "text-amber-700"}>{label(tenant.commercialHealth)}</span></td>
              </tr>)}
              {tenants.length === 0 && <tr><td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">No tenants match the selected filters.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Commercial contacts are stored separately from tenant membership and operational identity records.</p>
      </section>

      <section id="subscriptions" className="scroll-mt-6 space-y-3">
        <div><h2 className="font-semibold">Subscription register</h2><p className="text-sm text-muted-foreground">Persisted subscription lifecycle records. Mutations remain routed through the CC-03 lifecycle service.</p></div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Plan / version</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Term / currency</th><th className="px-4 py-3">Property allowance</th><th className="px-4 py-3">Trial ends</th><th className="px-4 py-3">Current period ends</th><th className="px-4 py-3">Founder action</th></tr></thead>
            <tbody className="divide-y">{data.subscriptions.map((subscription) => <tr key={String(subscription.id)}>
              <td className="px-4 py-3 font-medium">{String(subscription.tenant_name)}</td><td className="px-4 py-3">{label(String(subscription.plan_code))} · v{String(subscription.plan_version)}</td>
              <td className="px-4 py-3">{label(String(subscription.status))}</td><td className="px-4 py-3">{String(subscription.billing_term)} · {String(subscription.currency)}</td>
              <td className="px-4 py-3 tabular-nums">{String(subscription.property_count)}</td><td className="px-4 py-3">{date(subscription.trial_ends_at)}</td><td className="px-4 py-3">{date(subscription.current_period_ends_at)}</td><td className="px-4 py-3"><SubscriptionAction subscription={subscription} /></td>
            </tr>)}{data.subscriptions.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No subscription records have been provisioned.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section id="billing" className="scroll-mt-6 space-y-5">
        <div><h2 className="font-semibold">Billing and collections</h2><p className="text-sm text-muted-foreground">Invoices and payment transactions from the CC-04 financial ledger.</p></div>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Issued</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Collected</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Status</th></tr></thead>
            <tbody className="divide-y">{data.invoices.map((invoice) => <tr key={String(invoice.id)}>
              <td className="px-4 py-3 font-medium">{String(invoice.invoice_number)}</td><td className="px-4 py-3">{String(invoice.tenant_name)}</td><td className="px-4 py-3">{date(invoice.issued_at)}</td><td className="px-4 py-3">{date(invoice.due_at)}</td>
              <td className="px-4 py-3 tabular-nums">{money(Number(invoice.total_minor ?? 0), invoice.currency === "USD" ? "USD" : "TZS")}</td>
              <td className="px-4 py-3 tabular-nums">{money(Number(invoice.amount_paid_minor ?? 0), invoice.currency === "USD" ? "USD" : "TZS")}</td>
              <td className="px-4 py-3 tabular-nums">{money(Number(invoice.outstanding_minor ?? 0), invoice.currency === "USD" ? "USD" : "TZS")}</td><td className="px-4 py-3">{label(String(invoice.status))}</td>
            </tr>)}{data.invoices.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No issued invoice records.</td></tr>}</tbody>
          </table>
        </div>
        <div className="overflow-x-auto rounded-xl border">
          <div className="border-b px-4 py-3 font-medium">Payment transactions</div>
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Method</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Confirmed</th></tr></thead>
            <tbody className="divide-y">{data.payments.map((payment) => <tr key={String(payment.id)}>
              <td className="px-4 py-3">{String(payment.tenant_name)}</td><td className="px-4 py-3">{label(String(payment.provider))}</td><td className="px-4 py-3 text-xs">{String(payment.provider_transaction_ref ?? "Pending provider reference")}</td>
              <td className="px-4 py-3 tabular-nums">{money(Number(payment.amount_minor ?? 0), payment.currency === "USD" ? "USD" : "TZS")}</td><td className="px-4 py-3">{label(String(payment.payment_method ?? "—"))}</td><td className="px-4 py-3">{label(String(payment.status))}</td><td className="px-4 py-3">{date(payment.confirmed_at)}</td>
            </tr>)}{data.payments.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No payment transactions.</td></tr>}</tbody>
          </table>
        </div>
      </section>

      <section id="entitlements" className="scroll-mt-6 space-y-4">
        <div><h2 className="font-semibold">Entitlement administration evidence</h2><p className="text-sm text-muted-foreground">Current assignments and recorded enforcement decisions. Changes must use the CC-05 entitlement service.</p></div>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="overflow-x-auto rounded-xl border"><div className="border-b px-4 py-3 font-medium">Active assignments</div>
            <table className="w-full text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Feature</th><th className="px-4 py-3">Organisation</th><th className="px-4 py-3">Source</th><th className="px-4 py-3">Effective to</th></tr></thead>
              <tbody className="divide-y">{data.entitlementAssignments.filter((assignment) => assignment.status === "active").map((assignment) => <tr key={String(assignment.id)}><td className="px-4 py-3">{String(assignment.feature_code)}</td><td className="px-4 py-3 text-xs">{String(assignment.organisation_id)}</td><td className="px-4 py-3">{label(String(assignment.source_type))}</td><td className="px-4 py-3">{date(assignment.effective_to)}</td></tr>)}
              {data.entitlementAssignments.filter((assignment) => assignment.status === "active").length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No active entitlement assignments.</td></tr>}</tbody></table>
          </div>
          <div className="overflow-x-auto rounded-xl border"><div className="border-b px-4 py-3 font-medium">Latest enforcement decisions</div>
            <table className="w-full text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Feature</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Date</th></tr></thead>
              <tbody className="divide-y">{data.entitlementDecisions.slice(0,20).map((decision) => <tr key={String(decision.id)}><td className="px-4 py-3">{String(decision.feature_code)}</td><td className="px-4 py-3">{decision.allowed ? "Allowed" : "Denied"}</td><td className="px-4 py-3 text-xs">{label(String(decision.outcome))}</td><td className="px-4 py-3">{date(decision.decided_at)}</td></tr>)}
              {data.entitlementDecisions.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No enforcement decisions have been recorded.</td></tr>}</tbody></table>
          </div>
        </div>
      </section>

      <section id="plans" className="scroll-mt-6 space-y-3">
        <div><h2 className="font-semibold">Plans and pricing policy versions</h2><p className="text-sm text-muted-foreground">Version history from founder-managed CC-02 policy configuration. No second pricing engine is introduced.</p></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Policy</th><th className="px-4 py-3">Version</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Effective from</th><th className="px-4 py-3">Created</th></tr></thead>
          <tbody className="divide-y">{data.policyVersions.map((policy) => <tr key={String(policy.id)}><td className="px-4 py-3">{label(String(policy.policy_type))}</td><td className="px-4 py-3">v{String(policy.version)}</td><td className="px-4 py-3">{label(String(policy.status))}</td><td className="px-4 py-3">{date(policy.effective_from)}</td><td className="px-4 py-3">{date(policy.created_at)}</td></tr>)}
          {data.policyVersions.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No published commercial policy versions. Pricing and entitlement resolution must remain fail-closed.</td></tr>}</tbody>
        </table></div>
      </section>

      <section id="notifications" className="scroll-mt-6 space-y-3">
        <div><h2 className="font-semibold">Commercial notification outbox</h2><p className="text-sm text-muted-foreground">Persisted delivery attempts and provider references from the CC-04 notification pipeline.</p></div>
        <div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm">
          <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Type</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Provider reference</th><th className="px-4 py-3">Created</th></tr></thead>
          <tbody className="divide-y">{data.notifications.map((notification) => <tr key={String(notification.id)}><td className="px-4 py-3">{label(String(notification.notification_type))}</td><td className="px-4 py-3">{String(notification.recipient_email)}</td><td className="px-4 py-3">{label(String(notification.status))}</td><td className="px-4 py-3 text-xs">{String(notification.provider_message_ref ?? "—")}</td><td className="px-4 py-3">{date(notification.created_at)}</td></tr>)}
          {data.notifications.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No commercial notifications have been generated.</td></tr>}</tbody>
        </table></div>
      </section>

      <section id="intelligence" className="scroll-mt-6 space-y-3">
        <div><h2 className="font-semibold">Commercial intelligence</h2><p className="text-sm text-muted-foreground">Operationally meaningful portfolio indicators derived from the current persisted ledger.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric title="Entitlement decisions" value={String(data.entitlementDecisions.length)} detail="Latest 100 persisted decisions" icon={ShieldCheck} />
          <Metric title="Notification records" value={String(data.notifications.length)} detail="Latest 100 outbox records" icon={Activity} />
          <Metric title="Invoices in register" value={String(data.invoices.length)} detail="Issued receivables" icon={FileText} />
          <Metric title="Payment transactions" value={String(data.payments.length)} detail="Persisted payment attempts and settlements" icon={CreditCard} />
        </div>
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
