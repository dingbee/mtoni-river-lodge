import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, FileText, Wallet, RefreshCw, Scale } from "lucide-react";
import { getFounderCommercialWorkspace } from "@/domains/commercial/founder-control-centre.functions";
import {
  createCommercialInvoiceDraft, issueCommercialInvoiceDraft, recordUnallocatedCommercialPayment,
  confirmUnallocatedCommercialPayment, allocateUnallocatedCommercialPayment,
  recordCommercialInvoiceAdjustment, reverseCommercialPayment, getCommercialReceivablesSummary,
} from "@/domains/commercial/commercial-payment.functions";

export const Route = createFileRoute("/_authenticated/founder/billing")({
  head: () => ({ meta: [{ title: "Billing & Collections — StayNas Founder" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => {
    const [workspace, receivables] = await Promise.all([getFounderCommercialWorkspace(), getCommercialReceivablesSummary()]);
    return { workspace, receivables };
  },
  component: FounderBilling,
});

type Currency = "TZS" | "USD";
const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: unknown) => value ? new Date(String(value)).toLocaleDateString() : "—";
const amount = (minor: unknown, currency: unknown) => new Intl.NumberFormat("en-TZ", { style: "currency", currency: currency === "USD" ? "USD" : "TZS", maximumFractionDigits: 2 }).format(Number(minor ?? 0) / 100);
const toMinor = (value: string) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Enter a positive amount.");
  const minor = Math.round(number * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("Amount is outside the supported range.");
  return minor;
};

function DraftInvoice({ subscriptions }: { subscriptions: Array<Record<string, unknown>> }) {
  const router = useRouter();
  const [subscriptionId, setSubscriptionId] = useState(String(subscriptions[0]?.id ?? ""));
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [taxText, setTaxText] = useState("");
  const [approvalRef, setApprovalRef] = useState("");
  const [issueConfirmed, setIssueConfirmed] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const createDraft = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const taxSnapshot = JSON.parse(taxText) as Record<string, unknown>;
      const result = await createCommercialInvoiceDraft({ data: {
        subscriptionId, periodStart: new Date(periodStart).toISOString(), periodEnd: new Date(periodEnd).toISOString(),
        idempotencyKey: crypto.randomUUID(), taxSnapshot,
        discountSnapshot: { amountMinor: 0, policyRef: "none" },
      }});
      setDraftId(result.invoiceId);
      setMessage("Invoice draft persisted. It has not been issued.");
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Draft creation failed."); }
    finally { setBusy(false); }
  };
  const issueDraft = async () => {
    if (!issueConfirmed) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await issueCommercialInvoiceDraft({ data: {
        invoiceId: draftId, dueAt: new Date(dueAt).toISOString(), approvalRef,
      }});
      setDraftId(""); setApprovalRef("");
      setMessage("Invoice issued through the CC-04 financial ledger.");
      await router.invalidate();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invoice issuance failed."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border bg-card p-4 space-y-4">
    <div><h3 className="font-semibold">Issue subscription invoice</h3><p className="text-sm text-muted-foreground">Create a persisted draft first. Issuance requires a due date and approval reference. No tax treatment is assumed.</p></div>
    {subscriptions.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions exist to invoice.</p> : <>
      <label className="block text-xs font-medium">Subscription<select value={subscriptionId} onChange={(e)=>setSubscriptionId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{subscriptions.map((s)=><option key={String(s.id)} value={String(s.id)}>{String(s.tenant_name)} · {label(s.plan_code)} · {label(s.status)}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Billing period start<input type="datetime-local" value={periodStart} onChange={(e)=>setPeriodStart(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" required /></label><label className="text-xs font-medium">Billing period end<input type="datetime-local" value={periodEnd} onChange={(e)=>setPeriodEnd(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" required /></label></div>
      <label className="block text-xs font-medium">Tax snapshot JSON (required)<textarea value={taxText} onChange={(e)=>setTaxText(e.target.value)} placeholder='{"treatment":"...","policyRef":"...","amountMinor":0,"currency":"TZS"}' className="mt-1 min-h-24 w-full rounded-md border bg-background p-2 font-mono text-xs" /></label>
      <button disabled={busy || !subscriptionId || !periodStart || !periodEnd || !taxText.trim()} onClick={()=>void createDraft()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy ? "Working…" : "Create invoice draft"}</button>
      {draftId && <div className="rounded-lg border p-3 space-y-3"><p className="text-xs">Draft invoice ID: <span className="font-mono">{draftId}</span></p><div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Due date<input type="datetime-local" value={dueAt} onChange={(e)=>setDueAt(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label><label className="text-xs font-medium">Approval reference<input value={approvalRef} onChange={(e)=>setApprovalRef(e.target.value)} placeholder="Approved billing reference" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label></div><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={issueConfirmed} onChange={e=>setIssueConfirmed(e.target.checked)} className="mt-0.5" /> I confirm this invoice is approved for issuance using the supplied tax and billing snapshots.</label><button disabled={busy || !issueConfirmed || !dueAt || approvalRef.trim().length<4} onClick={()=>void issueDraft()} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Issue approved invoice</button></div>}
    </>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}

function ManualCollection({ accounts, providers }: { accounts: Array<Record<string, unknown>>; providers: Array<Record<string, unknown>> }) {
  const router = useRouter();
  const [accountId,setAccountId]=useState(String(accounts[0]?.accountId ?? ""));
  const selectedAccount = accounts.find((account) => account.accountId === accountId);
  const eligibleProviders = providers.filter((p)=>p.status==="active" && ["manual","bank_transfer"].includes(String(p.provider)) && p.organisation_id === selectedAccount?.id);
  const availableProviders = eligibleProviders.filter((p)=>Array.isArray(p.supported_currencies) && (p.supported_currencies as string[]).includes(currency));
  const [providerId,setProviderId]=useState(String(eligibleProviders[0]?.id ?? ""));
  const [currency,setCurrency]=useState<Currency>("TZS");
  const [amountText,setAmountText]=useState("");
  const [paymentId,setPaymentId]=useState("");
  const [receiptRef,setReceiptRef]=useState("");
  const [verificationSource,setVerificationSource]=useState<"authorized_manual_verification"|"bank_statement_reconciliation">("bank_statement_reconciliation");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const create = async () => {
    setBusy(true);setError("");setMessage("");
    try {
      const result=await recordUnallocatedCommercialPayment({data:{accountId,providerAccountId:providerId,amountMinor:toMinor(amountText),currency,idempotencyKey:crypto.randomUUID()}});
      setPaymentId(result.paymentId);setMessage("Pending manual collection recorded. Verify it against the supporting receipt or bank statement before allocation.");
      await router.invalidate();
    } catch(e){setError(e instanceof Error?e.message:"Manual collection could not be recorded.");} finally{setBusy(false);}
  };
  const verify = async () => {
    setBusy(true);setError("");setMessage("");
    try {
      await confirmUnallocatedCommercialPayment({data:{paymentId,providerTransactionRef:receiptRef,amountMinor:toMinor(amountText),currency,verificationSource}});
      setMessage("Collection verified and recorded in the immutable financial ledger.");setPaymentId("");setReceiptRef("");
      await router.invalidate();
    } catch(e){setError(e instanceof Error?e.message:"Manual collection verification failed.");} finally{setBusy(false);}
  };
  return <section className="rounded-xl border bg-card p-4 space-y-4">
    <div><h3 className="font-semibold">Record and verify manual collection</h3><p className="text-sm text-muted-foreground">Only manual or bank-transfer provider accounts are accepted. Provider-confirmed payment status cannot be fabricated through this workflow.</p></div>
    {eligibleProviders.length===0 ? <p className="text-sm text-amber-700">No active manual or bank-transfer provider account is configured for this customer. Configure an approved provider account before recording manual collections.</p> : <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Customer account<select value={accountId} onChange={(e)=>{const next=accounts.find(a=>a.accountId===e.target.value);setAccountId(e.target.value);const match=providers.find(p=>p.status==="active" && ["manual","bank_transfer"].includes(String(p.provider)) && p.organisation_id===next?.id && Array.isArray(p.supported_currencies) && (p.supported_currencies as string[]).includes(currency));setProviderId(String(match?.id??""));}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{accounts.filter(a=>a.accountId).map(a=><option key={String(a.accountId)} value={String(a.accountId)}>{String(a.name)}</option>)}</select></label>
        <label className="text-xs font-medium">Provider account<select value={providerId} onChange={(e)=>setProviderId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{availableProviders.map(p=><option key={String(p.id)} value={String(p.id)}>{String(p.tenant_name)} · {label(p.provider)} · {String(p.provider_account_ref)}</option>)}</select></label>
        <label className="text-xs font-medium">Currency<select value={currency} onChange={(e)=>{const next=e.target.value as Currency;setCurrency(next);const match=eligibleProviders.find(p=>Array.isArray(p.supported_currencies) && (p.supported_currencies as string[]).includes(next));setProviderId(String(match?.id??""));}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option>TZS</option><option>USD</option></select></label>
        <label className="text-xs font-medium">Amount<input type="number" min="0.01" step="0.01" value={amountText} onChange={(e)=>setAmountText(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
      </div>
      {!paymentId ? <button disabled={busy||!accountId||!providerId||!availableProviders.some(p=>p.id===providerId)||!amountText} onClick={()=>void create()} className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy?"Working…":"Record pending collection"}</button> : <div className="space-y-3 rounded-lg border p-3">
        <p className="text-xs">Pending payment: <span className="font-mono">{paymentId}</span></p>
        <label className="block text-xs font-medium">Receipt / bank transaction reference<input value={receiptRef} onChange={(e)=>setReceiptRef(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>
        <label className="block text-xs font-medium">Verification source<select value={verificationSource} onChange={(e)=>setVerificationSource(e.target.value as typeof verificationSource)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="bank_statement_reconciliation">Bank statement reconciliation</option><option value="authorized_manual_verification">Authorized manual verification</option></select></label>
        <button disabled={busy||receiptRef.trim().length<2} onClick={()=>void verify()} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">Verify collection</button>
      </div>}
    </>}
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{message&&<p role="status" className="text-sm text-muted-foreground">{message}</p>}
  </section>;
}

function AllocateCollection({ collection, invoices }: { collection: Record<string, unknown>; invoices: Array<Record<string, unknown>> }) {
  const router=useRouter();
  const candidates=invoices.filter(i=>i.organisation_id===collection.organisation_id && i.currency===collection.currency && Number(i.outstanding_minor??0)>0);
  const [invoiceId,setInvoiceId]=useState(String(candidates[0]?.id??""));
  const [amountText,setAmountText]=useState(String(Number(collection.unallocated_minor??0)/100));
  const [settlementRef,setSettlementRef]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const submit=async()=>{if(!confirmed)return;setBusy(true);setMessage("");try{await allocateUnallocatedCommercialPayment({data:{paymentId:String(collection.payment_id),invoiceId,amountMinor:toMinor(amountText),settlementRef,idempotencyKey:crypto.randomUUID()}});setMessage("Allocation recorded.");await router.invalidate();}catch(e){setMessage(e instanceof Error?e.message:"Allocation failed.");}finally{setBusy(false);}};
  return <div className="flex min-w-[300px] flex-col gap-2"><select value={invoiceId} onChange={e=>setInvoiceId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">{candidates.map(i=><option key={String(i.id)} value={String(i.id)}>{String(i.invoice_number)} · {amount(i.outstanding_minor,i.currency)} outstanding</option>)}</select><input value={amountText} onChange={e=>setAmountText(e.target.value)} type="number" min="0.01" step="0.01" className="h-8 rounded-md border bg-background px-2 text-xs" /><input value={settlementRef} onChange={e=>setSettlementRef(e.target.value)} placeholder="Settlement reference" className="h-8 rounded-md border bg-background px-2 text-xs" /><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5" /> Confirm allocation to this invoice.</label><button disabled={busy||!confirmed||!invoiceId||settlementRef.trim().length<1} onClick={()=>void submit()} className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50">{busy?"Allocating…":"Allocate to invoice"}</button>{message&&<p className="text-xs text-muted-foreground">{message}</p>}</div>;
}

function InvoiceAdjustment({ invoice }: { invoice: Record<string, unknown> }) {
  const router=useRouter();
  const [type,setType]=useState<"credit_note"|"debit_note"|"write_off">("credit_note");
  const [amountText,setAmountText]=useState("");const [reason,setReason]=useState("");const [approval,setApproval]=useState("");const [reference,setReference]=useState("");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const submit=async()=>{if(!confirmed)return;setBusy(true);setMessage("");try{await recordCommercialInvoiceAdjustment({data:{invoiceId:String(invoice.id),adjustmentRef:reference,adjustmentType:type,amountMinor:toMinor(amountText),currency:invoice.currency as Currency,reasonCode:reason,approvalRef:approval}});setMessage("Adjustment posted to immutable financial history.");await router.invalidate();}catch(e){setMessage(e instanceof Error?e.message:"Adjustment failed.");}finally{setBusy(false);}};
  return <details className="min-w-[250px]"><summary className="cursor-pointer text-xs underline">Post adjustment</summary><div className="mt-2 space-y-2"><select value={type} onChange={e=>setType(e.target.value as typeof type)} className="h-8 w-full rounded-md border bg-background px-2 text-xs"><option value="credit_note">Credit note</option><option value="debit_note">Debit note</option><option value="write_off">Write-off</option></select><input value={amountText} onChange={e=>setAmountText(e.target.value)} placeholder="Amount" type="number" min="0.01" step="0.01" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Adjustment reference" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason code" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><input value={approval} onChange={e=>setApproval(e.target.value)} placeholder="Approval reference" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5" /> I confirm this approved financial adjustment.</label><button disabled={busy||!confirmed||!amountText||reference.trim().length<4||reason.trim().length<2||approval.trim().length<4} onClick={()=>void submit()} className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50">{busy?"Posting…":"Post approved adjustment"}</button>{message&&<p className="text-xs text-muted-foreground">{message}</p>}</div></details>;
}

function ReversePayment({ payment }: { payment: Record<string, unknown> }) {
  const router=useRouter();
  const [amountText,setAmountText]=useState(String(Number(payment.amount_minor??0)/100));
  const [reference,setReference]=useState("");const [reason,setReason]=useState("");const [confirmed,setConfirmed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const submit=async()=>{if(!confirmed)return;setBusy(true);setMessage("");try{await reverseCommercialPayment({data:{paymentId:String(payment.id),reversalReference:reference,amountMinor:toMinor(amountText),currency:payment.currency as Currency,reasonCode:reason,idempotencyKey:crypto.randomUUID()}});setMessage("Reversal recorded.");await router.invalidate();}catch(e){setMessage(e instanceof Error?e.message:"Reversal failed.");}finally{setBusy(false);}};
  return <details className="min-w-[220px]"><summary className="cursor-pointer text-xs underline">Reverse payment</summary><div className="mt-2 space-y-2"><input value={amountText} onChange={e=>setAmountText(e.target.value)} type="number" min="0.01" step="0.01" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Reversal reference" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason code" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5" /> I confirm this payment reversal.</label><button disabled={busy||!confirmed||reference.trim().length<4||reason.trim().length<2} onClick={()=>void submit()} className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50">{busy?"Recording…":"Record reversal"}</button>{message&&<p className="text-xs text-muted-foreground">{message}</p>}</div></details>;
}

function ConfirmPendingPayment({ payment }: { payment: Record<string, unknown> }) {
  const router=useRouter();
  const [reference,setReference]=useState("");const [source,setSource]=useState<"authorized_manual_verification"|"bank_statement_reconciliation">("bank_statement_reconciliation");
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
  const submit=async()=>{if(!confirmed)return;setBusy(true);setMessage("");try{await confirmUnallocatedCommercialPayment({data:{paymentId:String(payment.id),providerTransactionRef:reference,amountMinor:Number(payment.amount_minor),currency:payment.currency as Currency,verificationSource:source}});setMessage("Verified.");await router.invalidate();}catch(e){setMessage(e instanceof Error?e.message:"Verification failed.");}finally{setBusy(false);}};
  return <div className="min-w-[220px] space-y-2"><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="Receipt / bank reference" className="h-8 w-full rounded-md border bg-background px-2 text-xs" /><select value={source} onChange={e=>setSource(e.target.value as typeof source)} className="h-8 w-full rounded-md border bg-background px-2 text-xs"><option value="bank_statement_reconciliation">Bank statement</option><option value="authorized_manual_verification">Manual verification</option></select><label className="flex items-start gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-0.5" /> I confirm the reference and amount against supporting evidence.</label><button disabled={busy||!confirmed||reference.trim().length<2} onClick={()=>void submit()} className="rounded-md border px-2 py-1.5 text-xs disabled:opacity-50">{busy?"Verifying…":"Verify payment"}</button>{message&&<p className="text-xs text-muted-foreground">{message}</p>}</div>;
}

function FounderBilling() {
  const { workspace, receivables } = Route.useLoaderData() as {
    workspace: {
      tenants: Array<{ id: string; name: string; accountId: string | null }>;
      subscriptions: Array<Record<string, unknown>>;
      providerAccounts: Array<Record<string, unknown>>;
      invoices: Array<Record<string, unknown>>;
      payments: Array<Record<string, unknown>>;
      unallocatedCollections: Array<Record<string, unknown>>;
      reconciliationRuns: Array<Record<string, unknown>>;
    };
    receivables: Record<Currency, Record<string, unknown>>;
  };
  const invoices=workspace.invoices as Array<Record<string,unknown>>;
  const payments=workspace.payments as Array<Record<string,unknown>>;
  const accounts=workspace.tenants.filter((t)=>t.accountId) as Array<Record<string,unknown>>;
  const m=receivables as Record<string,Record<string,unknown>>;
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10"><div className="mx-auto max-w-[1440px] space-y-7">
    <a href="/founder" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Founder Commercial Control Centre</a>
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · Founder finance</p><h1 className="mt-2 text-3xl font-semibold">Billing & Collections</h1><p className="mt-2 text-sm text-muted-foreground">Financial operations backed by CC-04 ledger services. Provider confirmations, adjustments and allocations are persisted through authorized server functions.</p></header>
    <section className="grid gap-3 md:grid-cols-2">
      {(["TZS","USD"] as const).map(currency=><article key={currency} className="rounded-xl border bg-card p-4"><h2 className="font-semibold">{currency} receivables</h2><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Invoiced</p><p className="font-semibold">{amount(m[currency]?.invoicedMinor,currency)}</p></div><div><p className="text-xs text-muted-foreground">Collected</p><p className="font-semibold">{amount(m[currency]?.collectedMinor,currency)}</p></div><div><p className="text-xs text-muted-foreground">Outstanding</p><p className="font-semibold">{amount(m[currency]?.outstandingMinor,currency)}</p></div><div><p className="text-xs text-muted-foreground">Overdue</p><p className="font-semibold">{amount(m[currency]?.overdueMinor,currency)}</p></div><div><p className="text-xs text-muted-foreground">Unallocated</p><p className="font-semibold">{amount(m[currency]?.unallocatedMinor,currency)}</p></div><div><p className="text-xs text-muted-foreground">Credit balance</p><p className="font-semibold">{amount(m[currency]?.creditBalanceMinor,currency)}</p></div></div></article>)}
    </section>
    <div className="grid gap-4 xl:grid-cols-2"><DraftInvoice subscriptions={workspace.subscriptions as Array<Record<string,unknown>>} /><ManualCollection accounts={accounts} providers={workspace.providerAccounts as Array<Record<string,unknown>>} /></div>
    <section className="space-y-3"><div className="flex items-center gap-2"><FileText className="size-4" /><h2 className="font-semibold">Invoice register</h2></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Invoice</th><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Total</th><th className="px-4 py-3">Paid</th><th className="px-4 py-3">Outstanding</th><th className="px-4 py-3">Due</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Adjustments</th></tr></thead><tbody className="divide-y">{invoices.map(i=><tr key={String(i.id)}><td className="px-4 py-3 font-medium">{String(i.invoice_number)}</td><td className="px-4 py-3">{String(i.tenant_name)}</td><td className="px-4 py-3">{String(i.currency)}</td><td className="px-4 py-3">{amount(i.total_minor,i.currency)}</td><td className="px-4 py-3">{amount(i.amount_paid_minor,i.currency)}</td><td className="px-4 py-3">{amount(i.outstanding_minor,i.currency)}</td><td className="px-4 py-3">{date(i.due_at)}</td><td className="px-4 py-3">{label(i.status)}</td><td className="px-4 py-3"><InvoiceAdjustment invoice={i} /></td></tr>)}{invoices.length===0&&<tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No issued invoices.</td></tr>}</tbody></table></div></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Wallet className="size-4" /><h2 className="font-semibold">Payment register</h2></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Confirmed</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y">{payments.map(p=><tr key={String(p.id)}><td className="px-4 py-3">{String(p.tenant_name)}</td><td className="px-4 py-3">{label(p.provider)}</td><td className="px-4 py-3 text-xs">{String(p.provider_transaction_ref??"—")}</td><td className="px-4 py-3">{amount(p.amount_minor,p.currency)}</td><td className="px-4 py-3">{String(p.currency)}</td><td className="px-4 py-3">{label(p.status)}</td><td className="px-4 py-3">{date(p.confirmed_at)}</td><td className="px-4 py-3">{["successful","partially_reversed"].includes(String(p.status))?<ReversePayment payment={p} />: p.invoice_id===null && p.status==="pending" && ["manual","bank_transfer"].includes(String(p.provider))?<ConfirmPendingPayment payment={p} />:"—"}</td></tr>)}{payments.length===0&&<tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No payment transactions.</td></tr>}</tbody></table></div></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><RefreshCw className="size-4" /><h2 className="font-semibold">Unallocated collections</h2></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Unallocated</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Allocate</th></tr></thead><tbody className="divide-y">{workspace.unallocatedCollections.map(c=><tr key={String(c.payment_id)}><td className="px-4 py-3">{String(c.tenant_name)}</td><td className="px-4 py-3">{label(c.provider)}</td><td className="px-4 py-3 text-xs">{String(c.provider_transaction_ref??"—")}</td><td className="px-4 py-3">{amount(c.amount_minor,c.currency)}</td><td className="px-4 py-3">{amount(c.unallocated_minor,c.currency)}</td><td className="px-4 py-3">{label(c.status)}</td><td className="px-4 py-3"><AllocateCollection collection={c} invoices={invoices} /></td></tr>)}{workspace.unallocatedCollections.length===0&&<tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No confirmed unallocated collections.</td></tr>}</tbody></table></div></section>
    <section className="space-y-3"><div className="flex items-center gap-2"><Scale className="size-4" /><h2 className="font-semibold">Reconciliation runs</h2></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Currency</th><th className="px-4 py-3">Period</th><th className="px-4 py-3">Source reference</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y">{workspace.reconciliationRuns.map(r=><tr key={String(r.id)}><td className="px-4 py-3">{String(r.tenant_name)}</td><td className="px-4 py-3">{String(r.currency)}</td><td className="px-4 py-3">{date(r.period_start)} — {date(r.period_end)}</td><td className="px-4 py-3">{String(r.source_ref)}</td><td className="px-4 py-3">{label(r.status)}</td></tr>)}{workspace.reconciliationRuns.length===0&&<tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No reconciliation runs.</td></tr>}</tbody></table></div></section>
    <footer className="border-t pt-4 text-xs text-muted-foreground">All financial mutations use CC-04 server-side services. Manual payment verification requires an external receipt or bank reference. Currency values remain separated. Production database changes are not part of this review branch.</footer>
  </div></main>;
}
