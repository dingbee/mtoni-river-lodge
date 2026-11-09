import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, CreditCard, FileText } from "lucide-react";
import { getFounderCommercialWorkspace, getFounderSubscriptionSetup, createFounderCommercialSubscription } from "@/domains/commercial/founder-control-centre.functions";

export const Route=createFileRoute("/_authenticated/founder/subscriptions")({
  head:()=>({meta:[{title:"Subscription Administration — StayNas Founder"},{name:"robots",content:"noindex,nofollow"}]}),
  beforeLoad:async()=>{const {getCommercialFounderStatus}=await import("@/domains/_platform/founder-admin.functions");const access=await getCommercialFounderStatus();if(!access.isFounderAdmin)throw redirect({to:"/settings"});},
  loader:async()=>{
    const workspace=await getFounderCommercialWorkspace();
    try{return {workspace,setup:await getFounderSubscriptionSetup(),setupError:null};}
    catch(error){return {workspace,setup:null,setupError:error instanceof Error?error.message:"Published plan and pricing policies are unavailable."};}
  },
  component:FounderSubscriptions,
});
type Currency="TZS"|"USD";
type Setup={
  plans:Array<{code:string;name:string;status:string}>;
  planVersions:Array<{planCode:string;version:number;status:string;effectiveFrom:string|null;effectiveTo:string|null}>;
  prices:Array<{priceCode:string;planCode:string;planVersion:number;currency:Currency;billingTerm:"monthly"|"annual";priceMode:"fixed"|"quote_required";baseAmountMinor:number|null;includedProperties:number|null;additionalPropertyAmountMinor:number|null;status:string;effectiveFrom:string|null;effectiveTo:string|null}>;
  addons:Array<{code:string;name:string;status:string}>;
  addonPrices:Array<{priceCode:string;addonCode:string;currency:Currency;billingTerm:"monthly"|"annual";chargeModel:"flat"|"per_property";amountMinor:number;status:string;effectiveFrom:string|null;effectiveTo:string|null}>;
  composition:Array<{planCode:string;planVersion:number;status:string;moduleCodes:string[];addonCodes:string[];effectiveFrom:string|null;effectiveTo:string|null}>;
};
type Tenant={id:string;name:string;slug:string;accountId:string|null;propertyCount:number;subscription:{id:string;planCode:string;status:string}|null};
type SubscriptionData={workspace:{tenants:Tenant[];subscriptions:Array<Record<string,unknown>>};setup:Setup|null;setupError:string|null};
const label=(v:unknown)=>String(v??"—").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const money=(minor:number,currency:Currency)=>new Intl.NumberFormat("en-TZ",{style:"currency",currency,maximumFractionDigits:2}).format(minor/100);
const date=(v:unknown)=>v?new Date(String(v)).toLocaleDateString():"—";

function FounderSubscriptions(){
  const {workspace,setup,setupError}=Route.useLoaderData() as SubscriptionData;
  const router=useRouter();
  const eligibleTenants=workspace.tenants.filter(t=>t.accountId&&!t.subscription);
  const [accountId,setAccountId]=useState(String(eligibleTenants[0]?.accountId??""));
  const [planCode,setPlanCode]=useState<"essential"|"professional"|"enterprise">("essential");
  const versions=setup?.planVersions.filter(v=>v.planCode===planCode)??[];
  const [planVersion,setPlanVersion]=useState(setup?.planVersions.find(v=>v.planCode==="essential")?.version??1);
  const [currency,setCurrency]=useState<Currency>("TZS");
  const [billingTerm,setBillingTerm]=useState<"monthly"|"annual">("monthly");
  const [propertyCount,setPropertyCount]=useState(Math.max(1,eligibleTenants[0]?.propertyCount??1));
  const [addonCodes,setAddonCodes]=useState<string[]>([]);
  const [reasonCode,setReasonCode]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const selectedTenant=eligibleTenants.find(t=>t.accountId===accountId);
  const selectedPrice=setup?.prices.find(p=>p.planCode===planCode&&p.planVersion===planVersion&&p.currency===currency&&p.billingTerm===billingTerm)??null;
  const selectedComposition=setup?.composition.find(c=>c.planCode===planCode&&c.planVersion===planVersion)??null;
  const selectedAddonPrices=setup?.addonPrices.filter(p=>addonCodes.includes(p.addonCode)&&p.currency===currency&&p.billingTerm===billingTerm)??[];
  const preview=useMemo(()=>{
    if(!selectedPrice)return null;
    if(addonCodes.some(code=>!selectedComposition?.addonCodes.includes(code)&&!selectedAddonPrices.some(p=>p.addonCode===code)))return null;
    if(selectedPrice.priceMode==="quote_required")return {quoteRequired:true,total:null as number|null};
    if(selectedPrice.baseAmountMinor===null||selectedPrice.additionalPropertyAmountMinor===null||selectedPrice.includedProperties===null)return null;
    let total=selectedPrice.baseAmountMinor+Math.max(0,propertyCount-selectedPrice.includedProperties)*selectedPrice.additionalPropertyAmountMinor;
    for(const addon of selectedAddonPrices){
      if(selectedComposition?.addonCodes.includes(addon.addonCode))continue;
      total+=(addon.chargeModel==="per_property"?propertyCount:1)*addon.amountMinor;
    }
    return {quoteRequired:false,total};
  },[selectedPrice,propertyCount,selectedAddonPrices,selectedComposition]);
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const result=await createFounderCommercialSubscription({data:{
        accountId,planCode,planVersion,currency,billingTerm,propertyCount,addonCodes,
        reasonCode,idempotencyKey:crypto.randomUUID(),
      }});
      setMessage(result.quoteRequired
        ? `Enterprise quote request recorded. Subscription ${result.subscriptionId} remains pending activation; no fixed price or invoice was fabricated.`
        : `Pending subscription ${result.subscriptionId} created at ${money(Number((result.price as Record<string,unknown>).total??0),currency)}. Activation still requires verified payment and CC-03 lifecycle authorization.`);
      setReasonCode("");setAddonCodes([]);
      await router.invalidate();
    }catch(cause){setError(cause instanceof Error?cause.message:"Subscription assignment failed.");}
    finally{setBusy(false);}
  };
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10"><div className="mx-auto max-w-6xl space-y-7">
    <a href="/founder" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/> Founder Commercial Control Centre</a>
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · CC-03 subscription lifecycle</p><h1 className="mt-2 text-3xl font-semibold">Subscription Administration</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Assign published plan versions to registered commercial accounts. Price is resolved from the published CC-02 catalogue; the new subscription remains pending activation until payment and lifecycle requirements are satisfied.</p></header>
    <section className="rounded-xl border bg-card p-4 space-y-4"><div className="flex items-center gap-2"><CreditCard className="size-4"/><h2 className="font-semibold">Assign a commercial plan</h2></div>
      {setupError&&<div className="rounded-lg border border-amber-500/40 bg-amber-50 p-3 text-sm text-amber-900"><p className="font-medium">Published commercial policies are required.</p><p className="mt-1">{setupError}</p><a href="/founder/plans" className="mt-2 inline-block underline">Open plans and pricing administration</a></div>}
      {eligibleTenants.length===0&&<p className="text-sm text-muted-foreground">No registered commercial accounts without a subscription are available. Register an existing organisation in the tenant registry first, or resolve its existing subscription before assigning another.</p>}
      {setup&&eligibleTenants.length>0&&<form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs font-medium sm:col-span-2">Commercial customer<select required value={accountId} onChange={e=>{setAccountId(e.target.value);const t=eligibleTenants.find(x=>x.accountId===e.target.value);setPropertyCount(Math.max(1,t?.propertyCount??1));}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{eligibleTenants.map(t=><option key={t.accountId} value={String(t.accountId)}>{t.name} · {t.slug} · {t.propertyCount} properties</option>)}</select></label>
        <label className="text-xs font-medium">Plan<select value={planCode} onChange={e=>{const code=e.target.value as typeof planCode;setPlanCode(code);setPlanVersion(setup.planVersions.find(v=>v.planCode===code)?.version??1);setAddonCodes([]);}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{setup.plans.map(p=><option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
        <label className="text-xs font-medium">Plan version<select value={planVersion} onChange={e=>setPlanVersion(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{versions.map(v=><option key={v.version} value={v.version}>v{v.version}</option>)}</select></label>
        <label className="text-xs font-medium">Billing currency<select value={currency} onChange={e=>{const next=e.target.value as Currency;setCurrency(next);setAddonCodes(old=>old.filter(code=>setup.addonPrices.some(p=>p.addonCode===code&&p.currency===next&&p.billingTerm===billingTerm)));}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="TZS">TZS</option><option value="USD">USD</option></select></label>
        <label className="text-xs font-medium">Billing frequency<select value={billingTerm} onChange={e=>{const next=e.target.value as "monthly"|"annual";setBillingTerm(next);setAddonCodes(old=>old.filter(code=>setup.addonPrices.some(p=>p.addonCode===code&&p.currency===currency&&p.billingTerm===next)));}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="monthly">Monthly</option><option value="annual">Annual</option></select></label>
        <label className="text-xs font-medium">Property allowance<input required type="number" min={Math.max(1,selectedTenant?.propertyCount??1)} step={1} value={propertyCount} onChange={e=>setPropertyCount(Number(e.target.value))} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"/></label>
        <div className="space-y-2"><p className="text-xs font-medium">Available add-ons</p>{setup.addons.filter(a=>setup.addonPrices.some(p=>p.addonCode===a.code&&p.currency===currency&&p.billingTerm===billingTerm)).map(addon=><label key={addon.code} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={addonCodes.includes(addon.code)} onChange={e=>setAddonCodes(old=>e.target.checked?[...old,addon.code]:old.filter(code=>code!==addon.code))}/>{addon.name}</label>)}{setup.addons.length===0&&<p className="text-xs text-muted-foreground">No active add-ons in the published catalogue.</p>}</div>
        <div className="rounded-lg border bg-muted/20 p-3 sm:col-span-2"><p className="text-xs text-muted-foreground">Resolved pricing preview</p>{!selectedPrice?<p className="mt-1 text-sm text-amber-700">No active price for this plan version, currency and billing frequency. Check published CC-02 pricing.</p>:preview?.quoteRequired?<p className="mt-1 text-sm font-medium">Enterprise quote required — no fixed price will be inferred.</p>:preview?<p className="mt-1 text-xl font-semibold">{money(preview.total??0,currency)} <span className="text-xs font-normal text-muted-foreground">per {billingTerm==="monthly"?"month":"year"}</span></p>:<p className="mt-1 text-sm text-amber-700">Price snapshot incomplete.</p>}<p className="mt-1 text-xs text-muted-foreground">Final pricing is recalculated server-side from the effective published price records. No currency conversion is performed.</p></div>
        <label className="text-xs font-medium sm:col-span-2">Commercial approval / assignment reason<input required minLength={2} maxLength={200} value={reasonCode} onChange={e=>setReasonCode(e.target.value)} placeholder="Approved subscription assignment reference" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"/></label>
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3"><button type="submit" disabled={busy||!accountId||!selectedPrice||!preview} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy?"Creating…":"Create pending subscription"}</button><p className="text-xs text-muted-foreground">Does not activate service or confirm payment.</p></div>
      </form>}
      {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{message&&<p role="status" className="break-words text-sm text-muted-foreground">{message}</p>}
    </section>
    <section className="space-y-3"><div className="flex items-center gap-2"><FileText className="size-4"/><h2 className="font-semibold">Subscription records</h2></div><div className="overflow-x-auto rounded-xl border"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3">Tenant</th><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Currency / term</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Quote required</th><th className="px-4 py-3">Created</th></tr></thead><tbody className="divide-y">{workspace.subscriptions.map(s=><tr key={String(s.id)}><td className="px-4 py-3">{String(s.tenant_name)}</td><td className="px-4 py-3">{label(s.plan_code)} · v{String(s.plan_version)}</td><td className="px-4 py-3">{String(s.currency)} · {label(s.billing_term)}</td><td className="px-4 py-3">{label(s.status)}</td><td className="px-4 py-3">{s.quote_required?"Yes":"No"}</td><td className="px-4 py-3">{date(s.created_at)}</td></tr>)}{workspace.subscriptions.length===0&&<tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No subscription records.</td></tr>}</tbody></table></div></section>
    <footer className="border-t pt-4 text-xs text-muted-foreground">All new subscriptions are created through the founder-only server service and CC-03 lifecycle records. Plan activation still requires the approved commercial acceptance and verified financial workflow. Existing active subscriptions are not replaced by this initial assignment flow.</footer>
  </div></main>;
}
