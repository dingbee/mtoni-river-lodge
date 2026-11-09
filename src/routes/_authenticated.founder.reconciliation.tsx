import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getFounderReconciliationWorkspace } from "@/domains/commercial/founder-reconciliation.functions";
import {
  createCommercialReconciliationRun,
  reconcileCommercialProviderStatementRun,
  recordCommercialReconciliationLifecycleEvent,
  resolveCommercialReconciliationItem,
  completeCommercialReconciliationRun,
} from "@/domains/commercial/commercial-payment.functions";

type Workspace = {
  runs: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
  providers: Array<Record<string, unknown>>;
  organisations: Array<Record<string, unknown>>;
  integrityExceptions: Array<Record<string, unknown>>;
};

export const Route = createFileRoute("/_authenticated/founder/reconciliation")({
  head: () => ({ meta: [{ title: "Reconciliation Workspace — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => await getFounderReconciliationWorkspace() as Workspace,
  component: FounderReconciliationWorkspace,
});

const label = (value: unknown) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "—";

function FounderReconciliationWorkspace() {
  const data = Route.useLoaderData() as Workspace;
  const router = useRouter();
  const [providerId, setProviderId] = useState(String(data.providers.find((p) => p.status === "active")?.id ?? ""));
  const selectedProvider = data.providers.find((p) => String(p.id) === providerId);
  const supportedCurrencies = Array.isArray(selectedProvider?.supported_currencies) ? selectedProvider.supported_currencies as string[] : [];
  const [currency, setCurrency] = useState(supportedCurrencies[0] ?? "TZS");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [selectedRun, setSelectedRun] = useState("");
  const [statement, setStatement] = useState("providerRef,amountMinor,currency,status");
  const [resolutionRefs, setResolutionRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const itemsByRun = useMemo(() => {
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const item of data.items) {
      const key = String(item.run_id);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [data.items]);
  const eventsByItem = useMemo(() => {
    const grouped = new Map<string, Record<string, unknown>[]>();
    for (const event of data.events) {
      const key = String(event.item_id);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return grouped;
  }, [data.events]);

  const refresh = async () => { await router.invalidate(); };
  const createRun = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await createCommercialReconciliationRun({ data: {
        providerAccountId: providerId, currency: currency as "TZS" | "USD",
        periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString(),
        sourceRef,
      } });
      setSelectedRun(String(result.id));
      setMessage("Reconciliation run created. Import the matching provider statement below.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create reconciliation run."); }
    finally { setBusy(false); }
  };
  const importStatement = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const lines = statement.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const providerRows = lines.slice(1).map((line, index) => {
        const [providerRef, amountMinor, rowCurrency, status] = line.split(",").map((part) => part.trim());
        if (!providerRef || !/^\d+$/.test(amountMinor ?? "") || !["TZS", "USD"].includes(rowCurrency ?? "")
          || !["successful", "failed", "cancelled", "reversed"].includes(status ?? "")) {
          throw new Error(`Invalid statement row ${index + 2}. Expected providerRef,amountMinor,currency,status.`);
        }
        return { providerRef, amountMinor: Number(amountMinor), currency: rowCurrency as "TZS" | "USD", status: status as "successful" | "failed" | "cancelled" | "reversed" };
      });
      if (!providerRows.length) throw new Error("The statement contains no data rows.");
      if (providerRows.some((row) => !Number.isSafeInteger(row.amountMinor))) throw new Error("Statement amount exceeds safe transport precision; use manual exception handling.");
      const result = await reconcileCommercialProviderStatementRun({ data: { runId: selectedRun, providerRows } });
      setMessage(`Statement reconciled. ${result.findingCount} reconciliation findings persisted${result.replayed ? " (already imported)" : ""}.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Statement reconciliation failed."); }
    finally { setBusy(false); }
  };
  const recordEvent = async (itemId: string, eventType: "review_started" | "reopened" | "escalated") => {
    setBusy(true); setMessage("");
    try {
      await recordCommercialReconciliationLifecycleEvent({ data: {
        itemId, eventType, reasonCode: eventType === "review_started" ? "founder_review_started" : eventType === "reopened" ? "founder_exception_reopened" : "founder_escalation",
        note: null, evidence: {},
      } });
      setMessage(`Exception ${eventType.replaceAll("_", " ")}.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Lifecycle event failed."); }
    finally { setBusy(false); }
  };
  const resolveItem = async (itemId: string) => {
    const resolutionRef = resolutionRefs[itemId]?.trim();
    if (!resolutionRef) { setMessage("Enter an evidence or resolution reference before resolving."); return; }
    setBusy(true); setMessage("");
    try {
      await resolveCommercialReconciliationItem({ data: { itemId, resolutionRef } });
      setMessage("Exception resolved and evidence appended.");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Resolution failed."); }
    finally { setBusy(false); }
  };
  const completeRun = async (runId: string) => {
    setBusy(true); setMessage("");
    try {
      const result = await completeCommercialReconciliationRun({ data: { runId } });
      setMessage(`Run closed with status: ${String(result.status)}.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Run closure failed."); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10">
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Founder workspace</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Reconciliation Workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">Compare provider statements against persisted payments. Findings are evidence only; the ledger is never automatically adjusted.</p>
        </div>
        <div className="flex gap-2">
          <a href="/founder" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Control Centre</a>
          <a href="/founder/reporting" className="rounded-lg border px-3 py-2 text-sm hover:bg-muted">Commercial Reporting</a>
        </div>
      </header>

      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Create reconciliation run</h2>
        <form onSubmit={createRun} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="space-y-1 text-xs text-muted-foreground">Provider account
            <select required value={providerId} onChange={(e) => { setProviderId(e.target.value); const p = data.providers.find((item) => String(item.id) === e.target.value); setCurrency(String((p?.supported_currencies as string[] | undefined)?.[0] ?? "TZS")); }} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
              <option value="">Select provider</option>
              {data.providers.filter((p) => p.status === "active").map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.provider)} · {String(p.provider_account_ref)}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Currency
            <select required value={currency} onChange={(e) => setCurrency(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground">
              {supportedCurrencies.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Statement reference
            <input required value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="Provider statement ID" className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Period start
            <input required type="datetime-local" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground" />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground">Period end
            <input required type="datetime-local" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm text-foreground" />
          </label>
          <div className="flex items-end"><button disabled={busy || !providerId} className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Working…" : "Create run"}</button></div>
        </form>
      </section>

      <section className="rounded-xl border p-4">
        <h2 className="font-semibold">Import provider statement</h2>
        <p className="mt-1 text-xs text-muted-foreground">CSV columns: providerRef,amountMinor,currency,status. Status values: successful, failed, cancelled, reversed. Amounts must be integer minor units. TZS/USD mismatches are recorded as exceptions; no conversion is applied.</p>
        <form onSubmit={importStatement} className="mt-3 space-y-3">
          <select required value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Select an open reconciliation run</option>
            {data.runs.filter((run) => run.status === "open").map((run) => <option key={String(run.id)} value={String(run.id)}>{String(run.tenantName)} · {String(run.currency)} · {date(run.period_start)}</option>)}
          </select>
          <textarea rows={6} value={statement} onChange={(e) => setStatement(e.target.value)} className="w-full rounded-md border bg-background p-3 font-mono text-xs" />
          <button disabled={busy || !selectedRun} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Reconcile statement</button>
        </form>
      </section>

      {message && <p role="status" className="rounded-lg border p-3 text-sm">{message}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">Reconciliation runs</h2>
        {data.runs.map((run) => {
          const runItems = itemsByRun.get(String(run.id)) ?? [];
          const unresolved = runItems.filter((item) => item.resolution_status !== "resolved").length;
          return <article key={String(run.id)} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{String(run.tenantName)} · {String(run.currency)} · {String(run.provider?.provider ?? "Platform")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{String(run.source_ref)} · {date(run.period_start)} – {date(run.period_end)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Created {date(run.created_at)} · {runItems.length} findings · {unresolved} unresolved</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-md border px-2 py-1 text-xs">{label(run.status)}</span>
                {["open", "discrepancy"].includes(String(run.status)) && <button disabled={busy} onClick={() => void completeRun(String(run.id))} className="rounded-md border px-3 py-1.5 text-xs">Close run</button>}
              </div>
            </div>
            {runItems.length > 0 && <div className="mt-4 space-y-3">
              {runItems.map((item) => {
                const itemEvents = eventsByItem.get(String(item.id)) ?? [];
                return <div key={String(item.id)} className="rounded-lg bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div><p className="text-sm font-medium">{label(item.item_type)} · {String(item.provider_ref ?? item.internal_payment_id ?? "No reference")}</p>
                      <p className="text-xs text-muted-foreground">Expected {String(item.expected_amount_minor ?? "—")} {String(item.expected_currency ?? "")} · Observed {String(item.observed_amount_minor ?? "—")} {String(item.observed_currency ?? "")}</p>
                    </div>
                    <span className="text-xs">{exceptionStatus(item.resolution_status)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["open", "discrepancy"].includes(String(run.status)) && item.resolution_status !== "resolved" && <>
                      <button disabled={busy} onClick={() => void recordEvent(String(item.id), "review_started")} className="rounded border px-2 py-1 text-xs">Under review</button>
                      <button disabled={busy} onClick={() => void recordEvent(String(item.id), "escalated")} className="rounded border px-2 py-1 text-xs">Escalate</button>
                      <input value={resolutionRefs[String(item.id)] ?? ""} onChange={(e) => setResolutionRefs((prev) => ({ ...prev, [String(item.id)]: e.target.value }))} placeholder="Resolution evidence reference" className="h-8 min-w-[220px] rounded border bg-background px-2 text-xs" />
                      <button disabled={busy} onClick={() => void resolveItem(String(item.id))} className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground">Resolve</button>
                    </>}
                    {["open", "discrepancy"].includes(String(run.status)) && item.resolution_status === "resolved" &&
                      <button disabled={busy} onClick={() => void recordEvent(String(item.id), "reopened")} className="rounded border px-2 py-1 text-xs">Reopen exception</button>}
                  </div>
                  {itemEvents.length > 0 && <ul className="mt-2 space-y-1 border-l pl-3 text-xs text-muted-foreground">
                    {itemEvents.map((event) => <li key={String(event.id)}>{label(event.event_type)} · {date(event.occurred_at)} · {String(event.reason_code)} · responsible founder {String(event.actor_user_id ?? "service principal")}</li>)}
                  </ul>}
                </div>;
              })}
            </div>}
          </article>;
        })}
        {!data.runs.length && <p className="rounded-xl border p-6 text-sm text-muted-foreground">No reconciliation runs have been recorded.</p>}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Subscription and ledger integrity</h2>
          <p className="text-sm text-muted-foreground">Read-only cross-domain exceptions. This view detects missing current-period invoices, invoice term/currency mismatches, and active entitlements outside their subscription or effective window.</p>
        </div>
        {data.integrityExceptions.length ? data.integrityExceptions.map((item,index) => (
          <article key={`${String(item.domain)}-${String(item.subscription_id)}-${String(item.assignment_id ?? index)}-${String(item.exception_type)}`} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{label(String(item.exception_type))}</p>
              <span className="rounded-md border px-2 py-1 text-xs">{String(item.tenantName)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Subscription {String(item.subscription_id)} · {String(item.currency ?? item.feature_code ?? "")}</p>
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded bg-muted/40 p-3 text-xs">{JSON.stringify(item.evidence ?? {}, null, 2)}</pre>
          </article>
        )) : <p className="rounded-xl border p-6 text-sm text-muted-foreground">No subscription-to-invoice or entitlement-to-subscription consistency exceptions were detected.</p>}
      </section>
    </div>
  </main>;
}
