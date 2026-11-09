import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { getFounderCommercialWorkspace } from "@/domains/commercial/founder-control-centre.functions";
import { recordFounderEntitlementGrant } from "@/domains/commercial/entitlement.functions";
import { COMMERCIAL_MODULE_CODES } from "@/domains/commercial/catalogue-contract";

export const Route = createFileRoute("/_authenticated/founder/entitlements")({
  head: () => ({ meta: [{ title: "Entitlement Administration — StayNas Founder" }, { name: "robots", content: "noindex,nofollow" }] }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: () => getFounderCommercialWorkspace(),
  component: FounderEntitlements,
});

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : "—";

function FounderEntitlements() {
  const data=Route.useLoaderData();
  const router=useRouter();
  const [grantType,setGrantType]=useState<"override"|"custom_feature"|"addon_feature"|"platform_restriction">("override");
  const [organisationId,setOrganisationId]=useState(String(data.tenants[0]?.id??""));
  const [addonCode,setAddonCode]=useState("");
  const [featureCode,setFeatureCode]=useState<(typeof COMMERCIAL_MODULE_CODES)[number]>(COMMERCIAL_MODULE_CODES[0]);
  const [effect,setEffect]=useState<"granted"|"suspended"|"review">("granted");
  const [effectiveFrom,setEffectiveFrom]=useState(new Date().toISOString().slice(0,16));
  const [effectiveTo,setEffectiveTo]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const isAddon=grantType==="addon_feature";
  const isPlatform=grantType==="platform_restriction";
  const effects=grantType==="platform_restriction"?["suspended","review"]:grantType==="override"?["granted","suspended"]:["granted"];
  const submit=async(event:React.FormEvent<HTMLFormElement>)=>{
    event.preventDefault();setBusy(true);setError("");setMessage("");
    try{
      const result=await recordFounderEntitlementGrant({data:{
        grantType,organisationId:isAddon||isPlatform?null:organisationId,
        addonCode:isAddon?addonCode:null,featureCode,effect,
        effectiveFrom:new Date(effectiveFrom).toISOString(),
        effectiveTo:effectiveTo?new Date(effectiveTo).toISOString():null,reason,
      }});
      setMessage(`Entitlement rule ${result.id} recorded. Enforcement will use the authoritative CC-05 resolver.`);
      setReason("");setAddonCode("");await router.invalidate();
    }catch(cause){setError(cause instanceof Error?cause.message:"Entitlement rule could not be recorded.");}
    finally{setBusy(false);}
  };
  return <main className="min-h-screen bg-background px-4 py-7 text-foreground sm:px-7 lg:px-10"><div className="mx-auto max-w-7xl space-y-7">
    <a href="/founder" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Founder Commercial Control Centre</a>
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Nolmark CDMA · CC-05 entitlement engine</p><h1 className="mt-2 text-3xl font-semibold">Entitlement Administration</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Inspect plan, add-on and override decisions. Founder changes are recorded as durable rules and evaluated by the existing entitlement service; no UI component writes entitlement tables directly.</p></header>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-2"><ShieldCheck className="size-4" /><h2 className="font-semibold">Record entitlement rule</h2></div>
        <label className="block text-xs font-medium">Rule type<select value={grantType} onChange={e=>{const v=e.target.value as typeof grantType;setGrantType(v);setEffect(v==="platform_restriction"?"suspended":"granted");}} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="override">Tenant override</option><option value="custom_feature">Custom feature grant</option><option value="addon_feature">Add-on feature mapping</option><option value="platform_restriction">Platform restriction</option></select></label>
        {!isAddon&&!isPlatform&&<label className="block text-xs font-medium">Customer tenant<select value={organisationId} onChange={e=>setOrganisationId(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{data.tenants.map(t=><option key={t.id} value={t.id}>{t.name} · {t.slug}</option>)}</select></label>}
        {isAddon&&<label className="block text-xs font-medium">Purchased add-on code<input required value={addonCode} onChange={e=>setAddonCode(e.target.value)} placeholder="e.g. analytics_pack" className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label>}
        <label className="block text-xs font-medium">Feature / module<select value={featureCode} onChange={e=>setFeatureCode(e.target.value as typeof featureCode)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{COMMERCIAL_MODULE_CODES.map(code=><option key={code} value={code}>{label(code)}</option>)}</select></label>
        <label className="block text-xs font-medium">Effect<select value={effect} onChange={e=>setEffect(e.target.value as typeof effect)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm">{effects.map(item=><option key={item} value={item}>{label(item)}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-medium">Effective from<input required type="datetime-local" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label><label className="text-xs font-medium">Effective until (optional)<input type="datetime-local" value={effectiveTo} onChange={e=>setEffectiveTo(e.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" /></label></div>
        <label className="block text-xs font-medium">Reason / commercial approval rationale<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className="mt-1 min-h-20 w-full rounded-md border bg-background p-2 text-sm" /></label>
        <button disabled={busy||(!isAddon&&!isPlatform&&!organisationId)} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{busy?"Recording…":"Record entitlement rule"}</button>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}{message&&<p role="status" className="break-all text-sm text-muted-foreground">{message}</p>}
        <p className="text-xs text-muted-foreground">Rules are time-bounded and reason-coded. Revoke an override by recording a corresponding suspended override. Platform restrictions require explicit founder rationale.</p>
      </form>
      <div className="space-y-5">
        <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Founder entitlement rules</h2><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Feature</th><th className="px-3 py-2">Effect</th><th className="px-3 py-2">Effective window</th><th className="px-3 py-2">Reason</th></tr></thead><tbody className="divide-y">{data.entitlementGrantRules.map(rule=><tr key={String(rule.id)}><td className="px-3 py-2">{label(rule.grant_type)}<p className="text-xs text-muted-foreground">{String(rule.organisation_id??rule.addon_code??"Platform")}</p></td><td className="px-3 py-2">{String(rule.feature_code)}</td><td className="px-3 py-2">{label(rule.effect)}</td><td className="px-3 py-2 text-xs">{date(rule.effective_from)} — {date(rule.effective_to)}</td><td className="px-3 py-2 text-xs">{String(rule.reason)}</td></tr>)}{data.entitlementGrantRules.length===0&&<tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">No founder entitlement rules have been recorded.</td></tr>}</tbody></table></div></section>
        <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold">Enforcement evidence</h2><p className="mt-1 text-xs text-muted-foreground">Latest persisted CC-05 decisions; denied outcomes are retained for audit.</p><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[550px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-3 py-2">Feature</th><th className="px-3 py-2">Decision</th><th className="px-3 py-2">Outcome</th><th className="px-3 py-2">Time</th></tr></thead><tbody className="divide-y">{data.entitlementDecisions.map(d=><tr key={String(d.id)}><td className="px-3 py-2">{String(d.feature_code)}</td><td className="px-3 py-2">{d.allowed?"Allowed":"Denied"}</td><td className="px-3 py-2">{label(d.outcome)}</td><td className="px-3 py-2 text-xs">{date(d.decided_at)}</td></tr>)}{data.entitlementDecisions.length===0&&<tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No entitlement decisions have been persisted.</td></tr>}</tbody></table></div></section>
      </div>
    </div>
    <footer className="border-t pt-4 text-xs text-muted-foreground">Property allowance is controlled through the commercial subscription lifecycle, not by changing tenant property records. This workspace does not alter operational membership or property data.</footer>
  </div></main>;
}
