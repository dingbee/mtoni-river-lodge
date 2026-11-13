import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listFounderCommercialPolicies,
  listFounderCommercialPolicyAudit,
  saveFounderCommercialPolicy,
} from "@/domains/commercial/founder-policy.functions";

type PolicyType = "catalogue" | "pricing" | "composition" | "trial_policy";
type Section = "plans" | "capabilities" | "entitlements" | "pricing" | "quotas" | "composition" | "addons" | "trials" | "properties";
type PolicyRow = {
  id: string; policy_type: PolicyType; version: number; status: "draft" | "published" | "retired";
  payload: any; effective_from: string | null; effective_to: string | null; created_at: string; is_current: boolean;
};
type Payloads = {
  catalogue: { plans: any[]; planVersions: any[]; modules: any[]; planModules: any[]; addons: any[]; quotaDefinitions: any[] };
  pricing: { planPrices: any[]; addonPrices: any[] };
  composition: { compositions: any[]; compatibilityRules: any[] };
  trial_policy: any[];
};
const PLAN_CODES = ["essential", "professional", "enterprise"] as const;
const PLAN_LABELS: Record<string, string> = { essential: "Core", professional: "Pro", enterprise: "Enterprise" };
const MODULE_LABELS: Record<string, string> = {
  reservations: "Reservations", rooms: "Rooms", front_desk: "Front Desk", operations: "Operations",
  housekeeping: "Housekeeping", guests: "Guests", finance: "Finance", revenue: "Revenue",
  automation: "Automation", concierge: "Concierge", content: "Content", marketing: "Marketing",
  integrations: "Integrations", intelligence: "Intelligence",
};
const ENTITLEMENT_LEVELS = ["included", "limited", "advanced", "enterprise", "unavailable"];
const blank: Payloads = {
  catalogue: { plans: [], planVersions: [], modules: [], planModules: [], addons: [], quotaDefinitions: [] },
  pricing: { planPrices: [], addonPrices: [] },
  composition: { compositions: [], compatibilityRules: [] },
  trial_policy: [],
};
const sectionPolicy: Record<Section, PolicyType> = {
  plans: "catalogue", capabilities: "catalogue", entitlements: "composition", pricing: "pricing",
  quotas: "catalogue", composition: "composition", addons: "catalogue", trials: "trial_policy", properties: "pricing",
};
const nav: { id: Section; label: string; hint: string }[] = [
  { id: "plans", label: "Plans", hint: "Core, Pro and Enterprise" },
  { id: "capabilities", label: "Capabilities", hint: "Registered StayNas modules" },
  { id: "entitlements", label: "Module entitlements", hint: "Capability-by-plan matrix" },
  { id: "pricing", label: "Pricing", hint: "Monthly, annual and setup" },
  { id: "quotas", label: "Usage & quotas", hint: "Resource limits by plan" },
  { id: "composition", label: "Package composition", hint: "Included modules and dependencies" },
  { id: "addons", label: "Add-ons", hint: "Optional commercial products" },
  { id: "trials", label: "Trial policies", hint: "14-day activation policy" },
  { id: "properties", label: "Additional properties", hint: "Property allowance and overage" },
];
const inputClass = "mt-1 h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 text-sm";
const selectClass = inputClass;
const buttonClass = "rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const primaryClass = "rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const panelClass = "rounded-xl border border-border bg-card p-4 sm:p-5";
const codeLabel = (code: string) => PLAN_LABELS[code] ?? code;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
const minorToMajor = (value: number | null | undefined) => value == null ? "" : String(value / 100);
const majorToMinor = (value: string) => value.trim() === "" ? null : Math.round(Number(value) * 100);

export const Route = createFileRoute("/_authenticated/founder/plans")({
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  component: FounderCommercialAdministration,
});

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block min-w-0 text-xs font-medium text-muted-foreground">{label}{children}</label>;
}
function SectionHeading({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-semibold">{title}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

function FounderCommercialAdministration() {
  const listPoliciesFn = useServerFn(listFounderCommercialPolicies);
  const listAuditFn = useServerFn(listFounderCommercialPolicyAudit);
  const savePolicyFn = useServerFn(saveFounderCommercialPolicy);
  const [section, setSection] = useState<Section>("plans");
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [payloads, setPayloads] = useState<Payloads>(clone(blank));
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [saveStatus, setSaveStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedPolicy = sectionPolicy[section];

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rows, events] = await Promise.all([listPoliciesFn(), listAuditFn()]);
      const policyRows = rows as PolicyRow[];
      const next = clone(blank);
      for (const type of ["catalogue", "pricing", "composition", "trial_policy"] as const) {
        const current = policyRows.filter((row) => row.policy_type === type)
          .sort((a, b) => Number(b.is_current) - Number(a.is_current) || b.version - a.version)[0];
        if (current?.payload) (next as any)[type] = current.payload;
      }
      setPolicies(policyRows); setPayloads(next); setAudit(events as Array<Record<string, unknown>>);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Founder authorization or configuration lookup failed.");
    } finally { setLoading(false); }
  }, [listPoliciesFn, listAuditFn]);

  useEffect(() => { void refresh(); }, [refresh]);
  const update = <K extends keyof Payloads>(type: K, updater: (value: Payloads[K]) => Payloads[K]) => {
    setPayloads((previous) => ({ ...previous, [type]: updater(clone(previous[type])) }));
    setNotice(null);
  };
  const save = async (status: "draft" | "published" = saveStatus) => {
    setSaving(true); setError(null); setNotice(null);
    try {
      const result = await savePolicyFn({ data: {
        policyType: selectedPolicy, status, payload: payloads[selectedPolicy], effectiveFrom: null, effectiveTo: null,
      } });
      setNotice(`${result.policyType} version ${result.version} saved as ${result.status}. Previous versions remain immutable.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The commercial policy could not be saved.");
    } finally { setSaving(false); }
  };

  const cat = payloads.catalogue;
  const pricing = payloads.pricing;
  const composition = payloads.composition;
  const plans = [...cat.plans].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const modules = [...cat.modules].sort((a, b) => a.code.localeCompare(b.code));
  const currentRows = policies.filter((row) => row.policy_type === selectedPolicy).sort((a, b) => b.version - a.version);
  const current = currentRows.find((row) => row.is_current);
  const latestDraft = currentRows.find((row) => row.status === "draft");
  const policyState = latestDraft ? "Draft exists" : current ? `Published v${current.version}` : "Not configured";

  const ensureComposition = (planCode: string) => {
    const planVersion = Math.max(1, ...cat.planVersions.filter((v) => v.planCode === planCode).map((v) => Number(v.version) || 1));
    update("composition", (value) => {
      if (value.compositions.some((c) => c.planCode === planCode && c.planVersion === planVersion)) return value;
      value.compositions.push({ planCode, planVersion, status: "draft", moduleCodes: [], moduleEntitlements: [], addonCodes: [], effectiveFrom: null, effectiveTo: null });
      return value;
    });
  };
  const patchComposition = (planCode: string, patch: (row: any) => any) => update("composition", (value) => {
    const planVersion = Math.max(1, ...cat.planVersions.filter((v) => v.planCode === planCode).map((v) => Number(v.version) || 1));
    const index = value.compositions.findIndex((c) => c.planCode === planCode && c.planVersion === planVersion);
    if (index < 0) value.compositions.push(patch({ planCode, planVersion, status: "draft", moduleCodes: [], moduleEntitlements: [], addonCodes: [], effectiveFrom: null, effectiveTo: null }));
    else value.compositions[index] = patch(value.compositions[index]);
    return value;
  });

  const renderPlans = () => <div className="space-y-4">
    <SectionHeading title="Subscription plans" description="The StayNas catalogue uses the canonical Essential, Professional and Enterprise plan codes. Display names and descriptions are founder-editable; published versions remain immutable."
      action={<button className={buttonClass} disabled={loading} onClick={() => update("catalogue", (v) => {
        for (const [i, code] of PLAN_CODES.entries()) {
          if (!v.plans.some((p) => p.code === code)) v.plans.push({ code, name: PLAN_LABELS[code], description: "", status: "draft", sortOrder: i + 1 });
          if (!v.planVersions.some((p) => p.planCode === code)) v.planVersions.push({ planCode: code, version: 1, status: "draft", effectiveFrom: null, effectiveTo: null, changeReason: "Initial founder-authored catalogue version" });
        }
        return v;
      })}>Add missing plan records</button>} />
    {plans.length === 0 ? <Empty>No plan records have been authored. Use “Add missing plan records” to create the three canonical draft records. No pricing or entitlements are prefilled.</Empty> :
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Plan code</th><th className="p-3">Display name</th><th className="p-3">Description</th><th className="p-3">Status</th><th className="p-3">Display order</th></tr></thead><tbody className="divide-y">
      {plans.map((plan) => <tr key={plan.code}><td className="p-3 font-mono text-xs">{plan.code}</td><td className="p-3"><input className={inputClass} value={plan.name} onChange={(e) => update("catalogue", (v) => { const row=v.plans.find((x)=>x.code===plan.code); if(row) row.name=e.target.value; return v; })} /></td><td className="p-3"><input className={inputClass} value={plan.description} onChange={(e) => update("catalogue", (v) => { const row=v.plans.find((x)=>x.code===plan.code); if(row) row.description=e.target.value; return v; })} /></td><td className="p-3"><select className={selectClass} value={plan.status} onChange={(e) => update("catalogue", (v) => { const row=v.plans.find((x)=>x.code===plan.code); if(row) row.status=e.target.value; return v; })}><option value="draft">Draft</option><option value="published">Published</option><option value="retired">Retired</option></select></td><td className="p-3"><input type="number" min="0" className={inputClass} value={plan.sortOrder ?? 0} onChange={(e) => update("catalogue", (v) => { const row=v.plans.find((x)=>x.code===plan.code); if(row) row.sortOrder=Number(e.target.value); return v; })} /></td></tr>)}
      </tbody></table></div>}
    <div className={panelClass}><h3 className="text-sm font-semibold">Plan version records</h3><p className="mt-1 text-xs text-muted-foreground">A plan version is required before pricing, composition and trial policies can reference it.</p>
      <div className="mt-3 space-y-2">{cat.planVersions.map((v, i) => <div key={`${v.planCode}-${i}`} className="grid gap-2 sm:grid-cols-[1fr_100px_1fr_1fr]"><div className="flex items-center text-sm">{codeLabel(v.planCode)}</div><input aria-label="Version" type="number" min="1" className={inputClass} value={v.version} onChange={(e)=>update("catalogue",x=>{x.planVersions[i].version=Number(e.target.value);return x;})}/><select className={selectClass} value={v.status} onChange={(e)=>update("catalogue",x=>{x.planVersions[i].status=e.target.value;return x;})}><option value="draft">Draft</option><option value="published">Published</option><option value="retired">Retired</option></select><input className={inputClass} placeholder="Change reason" value={v.changeReason ?? ""} onChange={(e)=>update("catalogue",x=>{x.planVersions[i].changeReason=e.target.value || null;return x;})}/></div>)}</div>
    </div>
  </div>;

  const renderCapabilities = () => <div className="space-y-4">
    <SectionHeading title="StayNas capability registry" description="Hospitality-specific registered commercial modules. Codes are fixed to the existing StayNas capability contract; descriptions, categories and availability are founder-managed." />
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Capability</th><th className="p-3">Display name</th><th className="p-3">Category</th><th className="p-3">Description</th><th className="p-3">Availability</th></tr></thead><tbody className="divide-y">
      {modules.map((m) => <tr key={m.code}><td className="p-3 font-mono text-xs">{m.code}</td><td className="p-3"><input className={inputClass} value={m.name} onChange={(e)=>update("catalogue",v=>{const x=v.modules.find(z=>z.code===m.code);if(x)x.name=e.target.value;return v;})}/></td><td className="p-3"><input className={inputClass} value={m.category ?? ""} placeholder="Category" onChange={(e)=>update("catalogue",v=>{const x=v.modules.find(z=>z.code===m.code);if(x)x.category=e.target.value;return v;})}/></td><td className="p-3"><input className={inputClass} value={m.description} onChange={(e)=>update("catalogue",v=>{const x=v.modules.find(z=>z.code===m.code);if(x)x.description=e.target.value;return v;})}/></td><td className="p-3"><select className={selectClass} value={m.status} onChange={(e)=>update("catalogue",v=>{const x=v.modules.find(z=>z.code===m.code);if(x)x.status=e.target.value;return v;})}><option value="draft">Draft</option><option value="active">Available</option><option value="retired">Retired</option></select></td></tr>)}
    </tbody></table></div>
    <p className="text-xs text-muted-foreground">No capabilities are created automatically. Register only the StayNas modules shown in the existing domain contract.</p>
  </div>;

  const renderEntitlements = () => <div className="space-y-4">
    <SectionHeading title="Plan module entitlements" description="Set an independent entitlement level for every registered StayNas module on each plan. “Unavailable” denies inclusion; all other levels are included in the published package capability set." />
    {PLAN_CODES.map((code) => {
      const version = Math.max(1, ...cat.planVersions.filter((v)=>v.planCode===code).map((v)=>Number(v.version)||1));
      const row = composition.compositions.find((c)=>c.planCode===code && c.planVersion===version);
      return <div key={code} className={panelClass}><div className="mb-3 flex items-center justify-between"><div><h3 className="font-semibold">{codeLabel(code)}</h3><p className="text-xs text-muted-foreground">Plan version {version}</p></div><button className={buttonClass} onClick={()=>ensureComposition(code)}>Create entitlement record</button></div>
        {!row ? <Empty>No entitlement record yet.</Empty> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2">Registered capability</th><th className="p-2">Entitlement</th></tr></thead><tbody className="divide-y">
          {modules.map((m)=>{const state=row.moduleEntitlements?.find((x:any)=>x.moduleCode===m.code)?.level ?? (row.moduleCodes.includes(m.code)?"included":"unavailable");return <tr key={m.code}><td className="p-2"><div>{m.name}</div><div className="font-mono text-[10px] text-muted-foreground">{m.code}</div></td><td className="p-2"><select className={selectClass} value={state} onChange={(e)=>patchComposition(code,(current)=>{const items=[...(current.moduleEntitlements??[])].filter((x:any)=>x.moduleCode!==m.code);items.push({moduleCode:m.code,level:e.target.value});return {...current,moduleEntitlements:items,moduleCodes:items.filter((x:any)=>x.level!=="unavailable").map((x:any)=>x.moduleCode)};})}>{ENTITLEMENT_LEVELS.map(level=><option key={level} value={level}>{level[0].toUpperCase()+level.slice(1)}</option>)}</select></td></tr>})}
        </tbody></table></div>}
      </div>;
    })}
  </div>;

  const renderPricing = () => <div className="space-y-4">
    <SectionHeading title="Subscription pricing" description="Prices are stored as integer minor units. Enter major currency units here; no exchange-rate conversion is performed."
      action={<button className={buttonClass} onClick={()=>update("pricing",v=>{const p=PLAN_CODES.find(code=>!v.planPrices.some(x=>x.planCode===code&&x.currency==="TZS"&&x.billingTerm==="monthly"));if(p){v.planPrices.push({priceCode:`${p}_tzs_monthly`,planCode:p,planVersion:1,currency:"TZS",billingTerm:"monthly",priceMode:p==="enterprise"?"quote_required":"fixed",baseAmountMinor:null,includedProperties:null,additionalPropertyAmountMinor:null,implementationFeeMinor:null,status:"draft",effectiveFrom:null,effectiveTo:null});}return v;})}>Add plan price</button>} />
    <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1150px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Plan / version</th><th className="p-3">Currency</th><th className="p-3">Term</th><th className="p-3">Price mode</th><th className="p-3">Subscription</th><th className="p-3">Implementation</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody className="divide-y">
      {pricing.planPrices.map((p,i)=><tr key={p.priceCode}><td className="p-3">{codeLabel(p.planCode)} · v{p.planVersion}</td><td className="p-3"><select className={selectClass} value={p.currency} onChange={e=>update("pricing",v=>{v.planPrices[i].currency=e.target.value;v.planPrices[i].priceCode=`${v.planPrices[i].planCode}_${e.target.value.toLowerCase()}_${v.planPrices[i].billingTerm}`;return v;})}><option>TZS</option><option>USD</option></select></td><td className="p-3"><select className={selectClass} value={p.billingTerm} onChange={e=>update("pricing",v=>{v.planPrices[i].billingTerm=e.target.value;v.planPrices[i].priceCode=`${v.planPrices[i].planCode}_${v.planPrices[i].currency.toLowerCase()}_${e.target.value}`;return v;})}><option value="monthly">Monthly</option><option value="annual">Annual</option></select></td><td className="p-3"><select className={selectClass} value={p.priceMode} onChange={e=>update("pricing",v=>{v.planPrices[i].priceMode=e.target.value; if(e.target.value==="quote_required"){v.planPrices[i].baseAmountMinor=null;v.planPrices[i].includedProperties=null;v.planPrices[i].additionalPropertyAmountMinor=null;} return v;})}><option value="fixed">Fixed</option><option value="quote_required">Quote required</option></select></td><td className="p-3"><input className={inputClass} type="number" min="0" step="0.01" placeholder="Major units" disabled={p.priceMode==="quote_required"} value={minorToMajor(p.baseAmountMinor)} onChange={e=>update("pricing",v=>{v.planPrices[i].baseAmountMinor=majorToMinor(e.target.value);return v;})}/></td><td className="p-3"><input className={inputClass} type="number" min="0" step="0.01" placeholder="Fee" value={minorToMajor(p.implementationFeeMinor)} onChange={e=>update("pricing",v=>{v.planPrices[i].implementationFeeMinor=majorToMinor(e.target.value);return v;})}/></td><td className="p-3"><select className={selectClass} value={p.status} onChange={e=>update("pricing",v=>{v.planPrices[i].status=e.target.value;return v;})}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></td><td className="p-3"><button className={buttonClass} onClick={()=>update("pricing",v=>{v.planPrices.splice(i,1);return v;})}>Remove</button></td></tr>)}
    </tbody></table></div>
    <div className={panelClass}><h3 className="font-semibold">Currency coverage</h3><p className="mt-1 text-xs text-muted-foreground">Publishing requires each canonical plan to have monthly and annual entries in both TZS and USD. Enterprise uses quote-required pricing under the existing contract.</p></div>
  </div>;

  const renderQuotas = () => <div className="space-y-4">
    <SectionHeading title="Usage and quota definitions" description="Configure resource limits only where a verified StayNas commercial requirement exists. No default limits are assumed."
      action={<button className={buttonClass} onClick={()=>update("catalogue",v=>{v.quotaDefinitions.push({code:"",name:"",description:"",resource:"",unit:"",planCode:"essential",limit:null,period:"monthly",status:"draft"});return v;})}>Add quota definition</button>} />
    {cat.quotaDefinitions.length===0 ? <Empty>No quota definitions have been authored. Resource limits are not being inferred from operational data.</Empty> :
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Code</th><th className="p-3">Resource</th><th className="p-3">Name / unit</th><th className="p-3">Plan</th><th className="p-3">Limit</th><th className="p-3">Period</th><th className="p-3">Status</th><th className="p-3"/></tr></thead><tbody className="divide-y">
      {cat.quotaDefinitions.map((q,i)=><tr key={i}><td className="p-2"><input className={inputClass} value={q.code} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].code=e.target.value;return v;})}/></td><td className="p-2"><input className={inputClass} value={q.resource} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].resource=e.target.value;return v;})}/></td><td className="p-2"><input className={inputClass} value={q.name} placeholder="Name" onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].name=e.target.value;return v;})}/><input className={inputClass} value={q.unit} placeholder="Unit" onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].unit=e.target.value;return v;})}/></td><td className="p-2"><select className={selectClass} value={q.planCode} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].planCode=e.target.value;return v;})}>{PLAN_CODES.map(c=><option key={c} value={c}>{codeLabel(c)}</option>)}</select></td><td className="p-2"><input className={inputClass} type="number" min="0" placeholder="Unset" value={q.limit ?? ""} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].limit=numberOrNull(e.target.value);return v;})}/></td><td className="p-2"><select className={selectClass} value={q.period} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].period=e.target.value;return v;})}>{["lifetime","daily","monthly","annual"].map(x=><option key={x}>{x}</option>)}</select></td><td className="p-2"><select className={selectClass} value={q.status} onChange={e=>update("catalogue",v=>{v.quotaDefinitions[i].status=e.target.value;return v;})}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></td><td className="p-2"><button className={buttonClass} onClick={()=>update("catalogue",v=>{v.quotaDefinitions.splice(i,1);return v;})}>Remove</button></td></tr>)}
      </tbody></table></div>}
    <p className="text-xs text-muted-foreground">Quota definitions are persisted as commercial policy. Runtime quota enforcement is not added by this interface change; only already-enforced property allowance remains enforced by the existing entitlement engine.</p>
  </div>;

  const renderComposition = () => <div className="space-y-4">
    <SectionHeading title="Package composition" description="Choose modules and add-ons for each plan version. Compatibility rules are explicit; an absent rule does not imply a dependency or conflict." />
    {PLAN_CODES.map(code=>{const version=Math.max(1,...cat.planVersions.filter(v=>v.planCode===code).map(v=>Number(v.version)||1));const row=composition.compositions.find(c=>c.planCode===code&&c.planVersion===version);return <div key={code} className={panelClass}><div className="flex items-center justify-between"><div><h3 className="font-semibold">{codeLabel(code)}</h3><p className="text-xs text-muted-foreground">Version {version}</p></div><button className={buttonClass} onClick={()=>ensureComposition(code)}>Create composition</button></div>{!row?<p className="mt-3 text-sm text-muted-foreground">No package composition record.</p>:<div className="mt-4 grid gap-4 md:grid-cols-2"><div><h4 className="text-sm font-medium">Included modules</h4>{modules.map(m=><label key={m.code} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={row.moduleCodes.includes(m.code)} onChange={e=>patchComposition(code,c=>({...c,moduleCodes:e.target.checked?[...c.moduleCodes,m.code]:c.moduleCodes.filter((x:string)=>x!==m.code),moduleEntitlements:(c.moduleEntitlements??[]).filter((x:any)=>x.moduleCode!==m.code).concat({moduleCode:m.code,level:e.target.checked?"included":"unavailable"})}))}/>{m.name}</label>)}</div><div><h4 className="text-sm font-medium">Optional add-ons</h4>{cat.addons.map(a=><label key={a.code} className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={row.addonCodes.includes(a.code)} onChange={e=>patchComposition(code,c=>({...c,addonCodes:e.target.checked?[...c.addonCodes,a.code]:c.addonCodes.filter((x:string)=>x!==a.code)}))}/>{a.name} <span className="font-mono text-[10px] text-muted-foreground">{a.code}</span></label>)}{cat.addons.length===0&&<p className="text-xs text-muted-foreground">Register add-ons in the Add-ons section first.</p>}</div><div className="md:col-span-2"><Field label="Composition status"><select className={selectClass} value={row.status} onChange={e=>patchComposition(code,c=>({...c,status:e.target.value}))}><option value="draft">Draft</option><option value="published">Published</option><option value="retired">Retired</option></select></Field></div></div>}</div>})}
    <div className={panelClass}><div className="flex items-center justify-between"><div><h3 className="font-semibold">Add-on compatibility rules</h3><p className="text-xs text-muted-foreground">Dependencies and conflicts are only stored when explicitly authored.</p></div><button className={buttonClass} onClick={()=>update("composition",v=>{const a=cat.addons[0]?.code;if(a&&!v.compatibilityRules.some(x=>x.addonCode===a))v.compatibilityRules.push({addonCode:a,requiresModuleCodes:[],conflictsWithAddonCodes:[]});return v;})}>Add rule for first registered add-on</button></div>
      {composition.compatibilityRules.map((rule,i)=><div key={i} className="mt-3 grid gap-2 sm:grid-cols-3"><Field label="Add-on"><select className={selectClass} value={rule.addonCode} onChange={e=>update("composition",v=>{v.compatibilityRules[i].addonCode=e.target.value;return v;})}>{cat.addons.map(a=><option key={a.code} value={a.code}>{a.name}</option>)}</select></Field><Field label="Required modules (comma-separated codes)"><input className={inputClass} value={rule.requiresModuleCodes.join(",")} onChange={e=>update("composition",v=>{v.compatibilityRules[i].requiresModuleCodes=e.target.value.split(",").map(x=>x.trim()).filter(Boolean);return v;})}/></Field><Field label="Conflicting add-ons (comma-separated codes)"><input className={inputClass} value={rule.conflictsWithAddonCodes.join(",")} onChange={e=>update("composition",v=>{v.compatibilityRules[i].conflictsWithAddonCodes=e.target.value.split(",").map(x=>x.trim()).filter(Boolean);return v;})}/></Field></div>)}
    </div>
  </div>;

  const renderAddons = () => <div className="space-y-4">
    <SectionHeading title="Commercial add-ons" description="Optional products are registered separately from core hospitality modules. Their availability and price remain versioned commercial policy."
      action={<button className={buttonClass} onClick={()=>update("catalogue",v=>{v.addons.push({code:"",name:"",description:"",status:"draft"});return v;})}>Add add-on</button>} />
    {cat.addons.length===0?<Empty>No add-ons have been registered.</Empty>:<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Code</th><th className="p-3">Name</th><th className="p-3">Description</th><th className="p-3">Status</th><th className="p-3"/></tr></thead><tbody className="divide-y">{cat.addons.map((a,i)=><tr key={i}><td className="p-2"><input className={inputClass} value={a.code} onChange={e=>update("catalogue",v=>{v.addons[i].code=e.target.value;return v;})}/></td><td className="p-2"><input className={inputClass} value={a.name} onChange={e=>update("catalogue",v=>{v.addons[i].name=e.target.value;return v;})}/></td><td className="p-2"><input className={inputClass} value={a.description} onChange={e=>update("catalogue",v=>{v.addons[i].description=e.target.value;return v;})}/></td><td className="p-2"><select className={selectClass} value={a.status} onChange={e=>update("catalogue",v=>{v.addons[i].status=e.target.value;return v;})}><option value="draft">Draft</option><option value="active">Active</option><option value="retired">Retired</option></select></td><td className="p-2"><button className={buttonClass} onClick={()=>update("catalogue",v=>{v.addons.splice(i,1);return v;})}>Remove</button></td></tr>)}</tbody></table></div>}
    <div className={panelClass}><h3 className="font-semibold">Add-on prices</h3><p className="mt-1 text-xs text-muted-foreground">The existing price contract supports currency, billing term, flat or per-property charge models. Use the structured pricing section for plan price rows; add-on price entry remains available through advanced policy diagnostics only.</p></div>
  </div>;

  const renderTrials = () => <div className="space-y-4">
    <SectionHeading title="Trial policies" description="The StayNas trial contract fixes the duration at 14 days and the start trigger at subscription activation. Founder controls enablement and effective policy version." action={<button className={buttonClass} onClick={()=>update("trial_policy",v=>{const code=PLAN_CODES.find(c=>!v.some(x=>x.planCode===c));if(code)v.push({planCode:code,planVersion:1,policyVersion:1,enabled:false,durationDays:14,startTrigger:"subscription_activated",effectiveFrom:null,effectiveTo:null});return v;})}>Add missing plan policy</button>} />
    {payloads.trial_policy.length===0?<Empty>No trial policies have been authored. Trial activation remains fail-closed until all three plans have valid published policies.</Empty>:<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Plan</th><th className="p-3">Plan version</th><th className="p-3">Policy version</th><th className="p-3">Duration</th><th className="p-3">Trigger</th><th className="p-3">Enabled</th><th className="p-3"/></tr></thead><tbody className="divide-y">{payloads.trial_policy.map((p,i)=><tr key={i}><td className="p-3">{codeLabel(p.planCode)}</td><td className="p-2"><input className={inputClass} type="number" min="1" value={p.planVersion} onChange={e=>update("trial_policy",v=>{v[i].planVersion=Number(e.target.value);return v;})}/></td><td className="p-2"><input className={inputClass} type="number" min="1" value={p.policyVersion} onChange={e=>update("trial_policy",v=>{v[i].policyVersion=Number(e.target.value);return v;})}/></td><td className="p-3">14 days</td><td className="p-3">Subscription activation</td><td className="p-2"><input type="checkbox" checked={p.enabled} onChange={e=>update("trial_policy",v=>{v[i].enabled=e.target.checked;return v;})}/></td><td className="p-2"><button className={buttonClass} onClick={()=>update("trial_policy",v=>{v.splice(i,1);return v;})}>Remove</button></td></tr>)}</tbody></table></div>}
  </div>;

  const renderProperties = () => <div className="space-y-4">
    <SectionHeading title="Additional-property pricing" description="Property allowances and additional-property charges are part of each plan price. This section edits the existing pricing source of truth." />
    {pricing.planPrices.length===0?<Empty>No plan price records exist. Add price records in Pricing before configuring property allowances.</Empty>:<div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="p-3">Plan / term / currency</th><th className="p-3">Included properties</th><th className="p-3">Additional property price</th><th className="p-3">Pricing status</th></tr></thead><tbody className="divide-y">{pricing.planPrices.map((p,i)=><tr key={p.priceCode}><td className="p-3">{codeLabel(p.planCode)} · {p.billingTerm} · {p.currency}</td><td className="p-2"><input className={inputClass} type="number" min="1" value={p.includedProperties ?? ""} placeholder="Not configured" onChange={e=>update("pricing",v=>{v.planPrices[i].includedProperties=numberOrNull(e.target.value);return v;})}/></td><td className="p-2"><input className={inputClass} type="number" min="0" step="0.01" value={minorToMajor(p.additionalPropertyAmountMinor)} placeholder="Not configured" onChange={e=>update("pricing",v=>{v.planPrices[i].additionalPropertyAmountMinor=majorToMinor(e.target.value);return v;})}/></td><td className="p-3">{p.status}</td></tr>)}</tbody></table></div>}
    <p className="text-xs text-muted-foreground">Property-level customer exceptions continue to use the existing authorised override and subscription mechanisms. This page does not modify customer subscriptions or property records.</p>
  </div>;

  const renderSection = () => {
    switch(section) {
      case "plans": return renderPlans();
      case "capabilities": return renderCapabilities();
      case "entitlements": return renderEntitlements();
      case "pricing": return renderPricing();
      case "quotas": return renderQuotas();
      case "composition": return renderComposition();
      case "addons": return renderAddons();
      case "trials": return renderTrials();
      case "properties": return renderProperties();
    }
  };

  return <main className="mx-auto w-full max-w-7xl space-y-5 pb-10">
    <header className="space-y-2"><a href="/founder" className="text-sm text-muted-foreground underline">← Back to Founder Commercial Control Centre</a>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nolmark CDMA · Founder authority</p>
      <h1 className="text-2xl font-semibold tracking-tight">Plans &amp; Pricing</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">Manage the StayNas commercial catalogue, hospitality capabilities, entitlements, pricing, quotas and package policies. All changes use founder-authorised, append-only policy versions.</p>
    </header>
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Plans and pricing sections">
      {nav.map(item=><button key={item.id} type="button" onClick={()=>{setSection(item.id);setError(null);setNotice(null);setSaveStatus("draft");}} aria-current={section===item.id?"page":undefined} className={`rounded-lg border p-3 text-left transition-colors ${section===item.id?"border-primary bg-primary/10":"border-border bg-card hover:bg-muted/50"}`}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-[11px] text-muted-foreground">{item.hint}</span></button>)}
    </nav>
    <section className={panelClass}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3"><div><p className="text-xs text-muted-foreground">Editing policy family: {selectedPolicy.replace("_"," ")}</p><p className="mt-1 text-sm font-semibold">{policyState}</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" className={buttonClass} disabled={loading||saving} onClick={()=>void refresh()}>Refresh</button><button type="button" className={buttonClass} disabled={loading||saving} onClick={()=>void save("draft")}>{saving?"Saving…":"Save draft"}</button><button type="button" className={primaryClass} disabled={loading||saving} onClick={()=>void save("published")}>{saving?"Saving…":"Publish policy"}</button></div></div>
      {loading?<p className="py-10 text-center text-sm text-muted-foreground">Loading founder commercial policies…</p>:renderSection()}
      {error&&<p role="alert" className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {notice&&<p role="status" className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-sm">{notice}</p>}
      <div className="mt-5 border-t border-border pt-4"><label className="text-xs font-medium text-muted-foreground">Save action</label><select className="ml-2 rounded-md border border-border bg-background px-3 py-2 text-sm" value={saveStatus} onChange={e=>setSaveStatus(e.target.value as "draft"|"published")}><option value="draft">Draft</option><option value="published">Publish as current version</option></select><button type="button" className="ml-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50" disabled={saving||loading} onClick={()=>void save()}>{saving?"Saving…":saveStatus==="published"?"Publish current section":"Save current section"}</button>
      </div>
    </section>
    <section className={panelClass}><h2 className="font-semibold">Version history</h2><p className="mt-1 text-sm text-muted-foreground">Append-only versions for the selected commercial policy.</p>
      {currentRows.length===0?<p className="mt-3 text-sm text-muted-foreground">No versions have been authored for this policy.</p>:<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Version</th><th className="p-2">Status</th><th className="p-2">Current</th><th className="p-2">Created</th><th className="p-2">Effective window</th></tr></thead><tbody>{currentRows.map(row=><tr key={row.id} className="border-b border-border/60"><td className="p-2">v{row.version}</td><td className="p-2">{row.status}</td><td className="p-2">{row.is_current?"Yes":"No"}</td><td className="p-2">{new Date(row.created_at).toLocaleString()}</td><td className="p-2">{row.effective_from??"—"} to {row.effective_to??"—"}</td></tr>)}</tbody></table></div>}
    </section>
    <section className={panelClass}><h2 className="font-semibold">Founder security boundary</h2><p className="mt-2 text-sm text-muted-foreground">Every read verifies the founder principal. Each write is validated in the server handler and independently authorised by the database RPC. Policy versions are append-only and audit evidence is written atomically. Tenant administrators cannot author global plans or pricing.</p></section>
    <section className={panelClass}><h2 className="font-semibold">Commercial policy audit</h2><p className="mt-1 text-sm text-muted-foreground">Latest 100 founder policy configuration events.</p>
      {audit.length===0?<p className="mt-3 text-sm text-muted-foreground">No policy changes recorded.</p>:<div className="mt-3 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead><tr className="border-b text-muted-foreground"><th className="p-2">Time</th><th className="p-2">Action</th><th className="p-2">Outcome</th><th className="p-2">Reference</th></tr></thead><tbody>{audit.map((event,index)=><tr key={String(event.id??index)} className="border-b border-border/60"><td className="p-2">{String(event.occurred_at??"")}</td><td className="p-2">{String(event.action??"")}</td><td className="p-2">{String(event.outcome??"")}</td><td className="p-2 font-mono">{String(event.resource_ref??"")}</td></tr>)}</tbody></table></div>}
    </section>
    <p className="text-xs text-muted-foreground">Customer, subscription, billing, override and commercial-account modules remain in the Founder Commercial Control Centre. This workspace edits global versioned policy only.</p>
  </main>;
}
