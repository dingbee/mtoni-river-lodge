import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listFounderCommercialPolicies,
  listFounderCommercialPolicyAudit,
  saveFounderCommercialPolicy,
} from "@/domains/commercial/founder-policy.functions";
import { COMMERCIAL_MODULE_CODES, COMMERCIAL_PLAN_CODES } from "@/domains/commercial/catalogue-contract";

type PolicyType = "catalogue" | "pricing" | "composition" | "trial_policy";
type Section = "plans" | "capabilities" | "entitlements" | "pricing" | "composition" | "addons" | "trials";
type Row = Record<string, unknown>;
type PolicyRow = {
  id: string; policy_type: PolicyType; version: number; status: "draft" | "published" | "retired";
  payload: unknown; effective_from: string | null; effective_to: string | null; created_at: string; is_current: boolean;
};
type Payload = {
  plans: Row[]; planVersions: Row[]; modules: Row[]; planModules: Row[]; addons: Row[];
  planPrices: Row[]; addonPrices: Row[]; compositions: Row[]; compatibilityRules: Row[];
  trials: Row[];
};
const emptyPayload = (): Payload => ({
  plans: [], planVersions: [], modules: [], planModules: [], addons: [],
  planPrices: [], addonPrices: [], compositions: [], compatibilityRules: [], trials: [],
});
const sections: { id: Section; label: string; policy: PolicyType; description: string }[] = [
  { id: "plans", label: "Plans", policy: "catalogue", description: "Manage the three commercial plan identities, descriptions, status and version lifecycle." },
  { id: "capabilities", label: "Capabilities", policy: "catalogue", description: "Maintain the canonical StayNas commercial capability catalogue and its operational module references." },
  { id: "entitlements", label: "Entitlements", policy: "catalogue", description: "Manage explicit plan-to-capability inclusions. An absent record is unconfigured, not silently treated as included." },
  { id: "pricing", label: "Pricing", policy: "pricing", description: "Manage plan and add-on prices by currency and billing term. Amounts are entered in major currency units and stored as ISO-4217 minor units." },
  { id: "composition", label: "Package composition", policy: "composition", description: "Configure published plan-version modules, optional add-ons and explicit compatibility constraints." },
  { id: "addons", label: "Add-ons", policy: "catalogue", description: "Manage separately purchasable add-ons and their lifecycle." },
  { id: "trials", label: "Trial policies", policy: "trial_policy", description: "Configure the fixed 14-day subscription-activation trial policy for each plan version." },
];
const planLabels: Record<string, string> = { essential: "Essential", professional: "Professional", enterprise: "Enterprise" };
const moduleLabels: Record<string, string> = Object.fromEntries(COMMERCIAL_MODULE_CODES.map((code) => [code, code.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase())]));
const arrayAt = (payload: Payload, key: keyof Payload): Row[] => Array.isArray(payload[key]) ? payload[key] : [];
const asPayload = (raw: unknown): Payload => {
  const base = emptyPayload();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const source = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as (keyof Payload)[]) {
    const sourceKey = key === "trials" ? "trialPolicies" : key;
    const value = source[sourceKey];
    if (Array.isArray(value)) base[key] = value as Row[];
  }
  return base;
};
const major = (value: unknown) => typeof value === "number" ? String(value / 100) : "";
const minor = (value: string) => value.trim() === "" ? null : Math.round(Number(value) * 100);
const fieldClass = "mt-1 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm";
const buttonClass = "rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50";
const primaryClass = "rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const panelClass = "rounded-xl border border-border bg-card p-4 sm:p-5";
const headingClass = "text-sm font-semibold";
const mutedClass = "text-xs leading-5 text-muted-foreground";

export const Route = createFileRoute("/_authenticated/founder/plans")({
  beforeLoad: async () => {
    const { getCommercialFounderStatus } = await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  component: FounderCommercialAdministration,
});

function FounderCommercialAdministration() {
  const listPoliciesFn = useServerFn(listFounderCommercialPolicies);
  const listAuditFn = useServerFn(listFounderCommercialPolicyAudit);
  const savePolicyFn = useServerFn(saveFounderCommercialPolicy);
  const [section, setSection] = useState<Section>("plans");
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [payloads, setPayloads] = useState<Record<PolicyType, Payload>>({
    catalogue: emptyPayload(), pricing: emptyPayload(), composition: emptyPayload(), trial_policy: emptyPayload(),
  });
  const [advanced, setAdvanced] = useState(false);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("{}");
  const selected = sections.find((item) => item.id === section)!;
  const payload = payloads[selected.policy];
  const currentRows = useMemo(() => policies.filter((row) => row.policy_type === selected.policy).sort((a, b) => b.version - a.version), [policies, selected.policy]);
  const current = currentRows.find((row) => row.is_current);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [rows, auditRows] = await Promise.all([listPoliciesFn(), listAuditFn()]);
      const next = { catalogue: emptyPayload(), pricing: emptyPayload(), composition: emptyPayload(), trial_policy: emptyPayload() };
      for (const row of rows as PolicyRow[]) next[row.policy_type] = asPayload(row.payload);
      setPolicies(rows as PolicyRow[]);
      setAudit(auditRows as Array<Record<string, unknown>>);
      setPayloads(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Founder authorization or configuration lookup failed.");
    } finally { setLoading(false); }
  }, [listPoliciesFn, listAuditFn]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const row = policies.filter((item) => item.policy_type === selected.policy && item.status === "draft").sort((a, b) => b.version - a.version)[0]
      ?? policies.find((item) => item.policy_type === selected.policy && item.is_current);
    setJsonText(JSON.stringify(row?.payload ?? payloads[selected.policy], null, 2));
    setStatus("draft"); setNotice(null); setAdvanced(false);
  }, [section, policies, selected.policy, payloads]);

  const updateArray = (policy: PolicyType, key: keyof Payload, rows: Row[]) => {
    setPayloads((old) => ({ ...old, [policy]: { ...old[policy], [key]: rows } }));
  };
  const updateRow = (policy: PolicyType, key: keyof Payload, index: number, field: string, value: unknown) => {
    const rows = [...payloads[policy][key]];
    rows[index] = { ...rows[index], [field]: value };
    updateArray(policy, key, rows);
  };
  const addRow = (policy: PolicyType, key: keyof Payload, row: Row) => updateArray(policy, key, [...payloads[policy][key], row]);
  const removeRow = (policy: PolicyType, key: keyof Payload, index: number) => updateArray(policy, key, payloads[policy][key].filter((_, i) => i !== index));

  const save = async () => {
    setSaving(true); setError(null); setNotice(null);
    try {
      let raw: unknown = payloads[selected.policy];
      if (advanced) raw = JSON.parse(jsonText);
      const result = await savePolicyFn({ data: { policyType: selected.policy, status, payload: raw, effectiveFrom: null, effectiveTo: null } });
      setNotice(`${result.policyType} version ${result.version} saved as ${result.status}. Previous versions remain immutable.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The commercial configuration could not be saved."); }
    finally { setSaving(false); }
  };

  const plans = arrayAt(payload, "plans");
  const versions = arrayAt(payload, "planVersions");
  const modules = arrayAt(payload, "modules");
  const planModules = arrayAt(payload, "planModules");
  const addons = arrayAt(payload, "addons");
  const prices = arrayAt(payload, "planPrices");
  const addonPrices = arrayAt(payload, "addonPrices");
  const compositions = arrayAt(payload, "compositions");
  const compatibility = arrayAt(payload, "compatibilityRules");
  const trials = payloads.trial_policy.trials;

  const Field = ({ label, value, onChange, type = "text", placeholder, disabled = false }: { label: string; value: unknown; onChange: (value: string) => void; type?: string; placeholder?: string; disabled?: boolean }) => (
    <label className="block min-w-0 text-xs font-medium text-muted-foreground">{label}
      <input className={fieldClass} type={type} value={value == null ? "" : String(value)} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
  const Select = ({ label, value, options, onChange }: { label: string; value: unknown; options: Array<[string, string]>; onChange: (value: string) => void }) => (
    <label className="block min-w-0 text-xs font-medium text-muted-foreground">{label}
      <select className={fieldClass} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
      </select>
    </label>
  );
  const SectionTitle = ({ title, description, action }: { title: string; description?: string; action?: () => void }) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="text-base font-semibold">{title}</h2>{description && <p className={`mt-1 ${mutedClass}`}>{description}</p>}</div>
      {action && <button type="button" className={buttonClass} onClick={action}>+ Add record</button>}
    </div>
  );
  const TableWrap = ({ children }: { children: React.ReactNode }) => <div className="mt-3 overflow-x-auto rounded-lg border border-border"><table className="w-full min-w-[680px] text-left text-xs">{children}</table></div>;
  const Th = ({ children }: { children: React.ReactNode }) => <th className="border-b border-border bg-muted/40 px-3 py-2 font-semibold text-muted-foreground">{children}</th>;
  const Td = ({ children }: { children: React.ReactNode }) => <td className="border-b border-border/70 px-3 py-2 align-top">{children}</td>;
  const InlineInput = ({ value, onChange, type = "text" }: { value: unknown; onChange: (value: string) => void; type?: string }) => <input className="w-full min-w-24 rounded-md border border-border bg-background px-2 py-2 text-xs" type={type} value={value == null ? "" : String(value)} onChange={(event) => onChange(event.target.value)} />;
  const InlineSelect = ({ value, options, onChange }: { value: unknown; options: Array<[string, string]>; onChange: (value: string) => void }) => <select className="w-full min-w-28 rounded-md border border-border bg-background px-2 py-2 text-xs" value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}><option value="">Select…</option>{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>;
  const planOptions = COMMERCIAL_PLAN_CODES.map((code) => [code, planLabels[code]] as [string, string]);
  const moduleOptions = COMMERCIAL_MODULE_CODES.map((code) => [code, moduleLabels[code]] as [string, string]);
  const statusOptions = [["draft", "Draft"], ["published", "Published"], ["retired", "Retired"]] as [string, string][];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="space-y-2">
        <a href="/founder" className="text-sm text-muted-foreground underline">← Back to Founder Commercial Control Centre</a>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nolmark CDMA · Founder authority</p>
        <h1 className="text-2xl font-semibold tracking-tight">Plans &amp; Pricing</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">Manage StayNas commercial plans, capabilities, entitlements, pricing, package composition, add-ons and trial policy. All changes are founder-authorized, schema-validated, versioned and audited.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Plan catalogue", plans.length, "Configured plan records"],
          ["Capabilities", modules.length, "Registered commercial capabilities"],
          ["Active compositions", compositions.filter((row) => row.status === "published").length, "Published plan compositions"],
          ["Pricing records", prices.length + addonPrices.length, "Plan and add-on price records"],
        ].map(([label, count, hint]) => <div key={String(label)} className={panelClass}><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{loading ? "—" : count}</p><p className={mutedClass}>{hint}</p></div>)}
      </div>

      <nav className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7" aria-label="Commercial administration sections">
        {sections.map((item) => <button key={item.id} type="button" onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined} className={`rounded-lg border px-3 py-3 text-left text-sm transition-colors ${section === item.id ? "border-primary bg-primary/10 font-semibold" : "border-border hover:bg-muted"}`}>{item.label}</button>)}
      </nav>

      <main className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
          <div><h2 className="text-lg font-semibold">{selected.label}</h2><p className={`mt-1 max-w-3xl ${mutedClass}`}>{selected.description}</p></div>
          <div className="text-right text-xs text-muted-foreground">{current ? <>Current published version <strong>v{current.version}</strong></> : "No published version"}</div>
        </div>

        {section === "plans" && <div className="mt-5 space-y-6">
          <section><SectionTitle title="Commercial plans" description="The plan codes are fixed by the commercial contract. Names, descriptions and status are editable." action={() => addRow("catalogue", "plans", { code: "essential", name: "", description: "", status: "draft" })} />
            <TableWrap><thead><tr><Th>Code</Th><Th>Display name</Th><Th>Description</Th><Th>Status</Th><Th /></tr></thead><tbody>{plans.map((row, i) => <tr key={i}><Td><strong>{String(row.code ?? "")}</strong></Td><Td><InlineInput value={row.name} onChange={(v) => updateRow("catalogue", "plans", i, "name", v)} /></Td><Td><InlineInput value={row.description} onChange={(v) => updateRow("catalogue", "plans", i, "description", v)} /></Td><Td><InlineSelect value={row.status} options={statusOptions} onChange={(v) => updateRow("catalogue", "plans", i, "status", v)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("catalogue", "plans", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
          </section>
          <section><SectionTitle title="Plan versions" description="Published plan versions are immutable; create a new version for changes." action={() => addRow("catalogue", "planVersions", { planCode: "essential", version: 1, status: "draft", effectiveFrom: null, effectiveTo: null, changeReason: null })} />
            <TableWrap><thead><tr><Th>Plan</Th><Th>Version</Th><Th>Status</Th><Th>Effective from</Th><Th>Effective to</Th><Th>Change reason</Th><Th /></tr></thead><tbody>{versions.map((row, i) => <tr key={i}><Td><InlineSelect value={row.planCode} options={planOptions} onChange={(v) => updateRow("catalogue", "planVersions", i, "planCode", v)} /></Td><Td><InlineInput type="number" value={row.version} onChange={(v) => updateRow("catalogue", "planVersions", i, "version", Number(v))} /></Td><Td><InlineSelect value={row.status} options={statusOptions} onChange={(v) => updateRow("catalogue", "planVersions", i, "status", v)} /></Td><Td><InlineInput type="date" value={row.effectiveFrom} onChange={(v) => updateRow("catalogue", "planVersions", i, "effectiveFrom", v || null)} /></Td><Td><InlineInput type="date" value={row.effectiveTo} onChange={(v) => updateRow("catalogue", "planVersions", i, "effectiveTo", v || null)} /></Td><Td><InlineInput value={row.changeReason} onChange={(v) => updateRow("catalogue", "planVersions", i, "changeReason", v || null)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("catalogue", "planVersions", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
          </section>
        </div>}

        {section === "capabilities" && <section className="mt-5 space-y-3"><SectionTitle title="StayNas capability catalogue" description="The supported codes come from the existing StayNas commercial contract. Operational references connect capabilities to existing app modules." action={() => addRow("catalogue", "modules", { code: "reservations", name: "", description: "", status: "draft", operationalModuleRefs: [] })} />
          <TableWrap><thead><tr><Th>Capability code</Th><Th>Name</Th><Th>Description</Th><Th>Status</Th><Th>Operational module refs</Th><Th /></tr></thead><tbody>{modules.map((row, i) => <tr key={i}><Td><InlineSelect value={row.code} options={moduleOptions} onChange={(v) => updateRow("catalogue", "modules", i, "code", v)} /></Td><Td><InlineInput value={row.name} onChange={(v) => updateRow("catalogue", "modules", i, "name", v)} /></Td><Td><InlineInput value={row.description} onChange={(v) => updateRow("catalogue", "modules", i, "description", v)} /></Td><Td><InlineSelect value={row.status} options={[["draft","Draft"],["active","Active"],["retired","Retired"]]} onChange={(v) => updateRow("catalogue", "modules", i, "status", v)} /></Td><Td><InlineInput value={Array.isArray(row.operationalModuleRefs) ? row.operationalModuleRefs.join(", ") : ""} onChange={(v) => updateRow("catalogue", "modules", i, "operationalModuleRefs", v.split(",").map((x) => x.trim()).filter(Boolean))} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("catalogue", "modules", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
          <p className={mutedClass}>Supported commercial capabilities: {COMMERCIAL_MODULE_CODES.map((code) => moduleLabels[code]).join(" · ")}. The editor does not create or rename operational application modules.</p>
        </section>}

        {section === "entitlements" && <section className="mt-5 space-y-3"><SectionTitle title="Plan entitlement matrix" description="This contract currently supports explicit inclusion records. A missing cell is unconfigured; it is not an exclusion or an invented quota." action={() => addRow("catalogue", "planModules", { planCode: "essential", planVersion: 1, moduleCode: "reservations", included: true })} />
          <TableWrap><thead><tr><Th>Capability</Th>{planLabels && COMMERCIAL_PLAN_CODES.map((code) => <Th key={code}>{planLabels[code]}</Th>)}</tr></thead><tbody>{COMMERCIAL_MODULE_CODES.map((code) => <tr key={code}><Td><strong>{moduleLabels[code]}</strong><div className="text-[10px] text-muted-foreground">{code}</div></Td>{COMMERCIAL_PLAN_CODES.map((planCode) => { const found = planModules.find((row) => row.planCode === planCode && row.moduleCode === code); return <Td key={planCode}>{found ? <span className="inline-flex rounded-full bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700">Included · v{String(found.planVersion)}</span> : <span className="text-muted-foreground">Not configured</span>}<button type="button" className="mt-2 block text-primary underline" onClick={() => found ? removeRow("catalogue", "planModules", planModules.indexOf(found)) : addRow("catalogue", "planModules", { planCode, planVersion: 1, moduleCode: code, included: true })}>{found ? "Remove inclusion" : "Include capability"}</button></Td>; })}</tr>)}</tbody></TableWrap>
          <p className={mutedClass}>Limited, advanced, unavailable and numeric quota states are not represented by the existing persisted entitlement contract. They are intentionally not simulated here.</p>
        </section>}

        {section === "pricing" && <div className="mt-5 space-y-7">
          <section><SectionTitle title="Plan pricing" description="Amounts are stored in minor units. Enterprise must use quote-required pricing under the existing contract." action={() => addRow("pricing", "planPrices", { priceCode: "", planCode: "essential", planVersion: 1, currency: "TZS", billingTerm: "monthly", priceMode: "fixed", baseAmountMinor: null, includedProperties: null, additionalPropertyAmountMinor: null, status: "draft", effectiveFrom: null, effectiveTo: null })} />
            <TableWrap><thead><tr><Th>Price code</Th><Th>Plan</Th><Th>Version</Th><Th>Currency</Th><Th>Term</Th><Th>Mode</Th><Th>Base amount</Th><Th>Included properties</Th><Th>Additional property</Th><Th>Status</Th><Th /></tr></thead><tbody>{prices.map((row, i) => <tr key={i}><Td><InlineInput value={row.priceCode} onChange={(v) => updateRow("pricing", "planPrices", i, "priceCode", v)} /></Td><Td><InlineSelect value={row.planCode} options={planOptions} onChange={(v) => { updateRow("pricing", "planPrices", i, "planCode", v); updateRow("pricing", "planPrices", i, "priceMode", v === "enterprise" ? "quote_required" : "fixed"); if (v === "enterprise") { updateRow("pricing", "planPrices", i, "baseAmountMinor", null); updateRow("pricing", "planPrices", i, "includedProperties", null); updateRow("pricing", "planPrices", i, "additionalPropertyAmountMinor", null); } }} /></Td><Td><InlineInput type="number" value={row.planVersion} onChange={(v) => updateRow("pricing", "planPrices", i, "planVersion", Number(v))} /></Td><Td><InlineSelect value={row.currency} options={[["TZS","TZS"],["USD","USD"]]} onChange={(v) => updateRow("pricing", "planPrices", i, "currency", v)} /></Td><Td><InlineSelect value={row.billingTerm} options={[["monthly","Monthly"],["annual","Annual"]]} onChange={(v) => updateRow("pricing", "planPrices", i, "billingTerm", v)} /></Td><Td><InlineSelect value={row.priceMode} options={[["fixed","Fixed"],["quote_required","Quote required"]]} onChange={(v) => updateRow("pricing", "planPrices", i, "priceMode", v)} /></Td><Td>{row.priceMode === "quote_required" ? "Quote" : <InlineInput type="number" value={major(row.baseAmountMinor)} onChange={(v) => updateRow("pricing", "planPrices", i, "baseAmountMinor", minor(v))} />}</Td><Td>{row.priceMode === "quote_required" ? "—" : <InlineInput type="number" value={row.includedProperties} onChange={(v) => updateRow("pricing", "planPrices", i, "includedProperties", v === "" ? null : Number(v))} />}</Td><Td>{row.priceMode === "quote_required" ? "—" : <InlineInput type="number" value={major(row.additionalPropertyAmountMinor)} onChange={(v) => updateRow("pricing", "planPrices", i, "additionalPropertyAmountMinor", minor(v))} />}</Td><Td><InlineSelect value={row.status} options={[["draft","Draft"],["active","Active"],["retired","Retired"]]} onChange={(v) => updateRow("pricing", "planPrices", i, "status", v)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("pricing", "planPrices", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
          </section>
          <section><SectionTitle title="Add-on pricing" description="Separately chargeable add-ons with flat or per-property billing." action={() => addRow("pricing", "addonPrices", { priceCode: "", addonCode: "", currency: "TZS", billingTerm: "monthly", chargeModel: "flat", amountMinor: 0, status: "draft", effectiveFrom: null, effectiveTo: null })} />
            <TableWrap><thead><tr><Th>Price code</Th><Th>Add-on code</Th><Th>Currency</Th><Th>Term</Th><Th>Charge model</Th><Th>Amount</Th><Th>Status</Th><Th /></tr></thead><tbody>{addonPrices.map((row, i) => <tr key={i}><Td><InlineInput value={row.priceCode} onChange={(v) => updateRow("pricing", "addonPrices", i, "priceCode", v)} /></Td><Td><InlineInput value={row.addonCode} onChange={(v) => updateRow("pricing", "addonPrices", i, "addonCode", v)} /></Td><Td><InlineSelect value={row.currency} options={[["TZS","TZS"],["USD","USD"]]} onChange={(v) => updateRow("pricing", "addonPrices", i, "currency", v)} /></Td><Td><InlineSelect value={row.billingTerm} options={[["monthly","Monthly"],["annual","Annual"]]} onChange={(v) => updateRow("pricing", "addonPrices", i, "billingTerm", v)} /></Td><Td><InlineSelect value={row.chargeModel} options={[["flat","Flat"],["per_property","Per property"]]} onChange={(v) => updateRow("pricing", "addonPrices", i, "chargeModel", v)} /></Td><Td><InlineInput type="number" value={major(row.amountMinor)} onChange={(v) => updateRow("pricing", "addonPrices", i, "amountMinor", minor(v) ?? 0)} /></Td><Td><InlineSelect value={row.status} options={[["draft","Draft"],["active","Active"],["retired","Retired"]]} onChange={(v) => updateRow("pricing", "addonPrices", i, "status", v)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("pricing", "addonPrices", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
          </section>
        </div>}

        {section === "composition" && <div className="mt-5 space-y-6">
          <section><SectionTitle title="Plan package composition" description="Choose only modules and add-ons that have been explicitly configured in the catalogue." action={() => addRow("composition", "compositions", { planCode: "essential", planVersion: 1, status: "draft", moduleCodes: [], addonCodes: [], effectiveFrom: null, effectiveTo: null })} />
            <div className="mt-3 space-y-3">{compositions.map((row, i) => <div key={i} className="rounded-lg border border-border p-3"><div className="grid gap-3 sm:grid-cols-4"><Select label="Plan" value={row.planCode} options={planOptions} onChange={(v) => updateRow("composition", "compositions", i, "planCode", v)} /><Field label="Plan version" type="number" value={row.planVersion} onChange={(v) => updateRow("composition", "compositions", i, "planVersion", Number(v))} /><Select label="Status" value={row.status} options={statusOptions} onChange={(v) => updateRow("composition", "compositions", i, "status", v)} /><div className="flex items-end"><button className="text-destructive underline" onClick={() => removeRow("composition", "compositions", i)}>Remove composition</button></div></div><p className="mt-4 text-xs font-semibold">Included capabilities</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{COMMERCIAL_MODULE_CODES.map((code) => { const checked = Array.isArray(row.moduleCodes) && row.moduleCodes.includes(code); return <label key={code} className="flex items-center gap-2 rounded-md border border-border p-2 text-xs"><input type="checkbox" checked={checked} onChange={(e) => updateRow("composition", "compositions", i, "moduleCodes", e.target.checked ? [...(Array.isArray(row.moduleCodes) ? row.moduleCodes : []), code] : (Array.isArray(row.moduleCodes) ? row.moduleCodes.filter((x) => x !== code) : []))} />{moduleLabels[code]}</label>; })}</div><Field label="Add-on codes (comma-separated)" value={Array.isArray(row.addonCodes) ? row.addonCodes.join(", ") : ""} onChange={(v) => updateRow("composition", "compositions", i, "addonCodes", v.split(",").map((x) => x.trim()).filter(Boolean))} /><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Effective from" type="date" value={row.effectiveFrom} onChange={(v) => updateRow("composition", "compositions", i, "effectiveFrom", v || null)} /><Field label="Effective to" type="date" value={row.effectiveTo} onChange={(v) => updateRow("composition", "compositions", i, "effectiveTo", v || null)} /></div></div>)}</div>
          </section>
          <section><SectionTitle title="Add-on compatibility rules" description="Rules are explicit. An absent rule does not imply compatibility." action={() => addRow("composition", "compatibilityRules", { addonCode: "", requiresModuleCodes: [], conflictsWithAddonCodes: [] })} />
            {compatibility.map((row, i) => <div key={i} className="mt-2 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3"><Field label="Add-on code" value={row.addonCode} onChange={(v) => updateRow("composition", "compatibilityRules", i, "addonCode", v)} /><Field label="Required modules (comma-separated)" value={Array.isArray(row.requiresModuleCodes) ? row.requiresModuleCodes.join(", ") : ""} onChange={(v) => updateRow("composition", "compatibilityRules", i, "requiresModuleCodes", v.split(",").map((x) => x.trim()).filter(Boolean))} /><Field label="Conflicting add-ons (comma-separated)" value={Array.isArray(row.conflictsWithAddonCodes) ? row.conflictsWithAddonCodes.join(", ") : ""} onChange={(v) => updateRow("composition", "compatibilityRules", i, "conflictsWithAddonCodes", v.split(",").map((x) => x.trim()).filter(Boolean))} /><button className="text-left text-xs text-destructive underline" onClick={() => removeRow("composition", "compatibilityRules", i)}>Remove rule</button></div>)}
          </section>
        </div>}

        {section === "addons" && <section className="mt-5 space-y-3"><SectionTitle title="Commercial add-on catalogue" description="Add-ons are separate catalogue records. Their pricing and compatibility are managed in their respective sections." action={() => addRow("catalogue", "addons", { code: "", name: "", description: "", status: "draft" })} />
          <TableWrap><thead><tr><Th>Code</Th><Th>Name</Th><Th>Description</Th><Th>Status</Th><Th /></tr></thead><tbody>{addons.map((row, i) => <tr key={i}><Td><InlineInput value={row.code} onChange={(v) => updateRow("catalogue", "addons", i, "code", v)} /></Td><Td><InlineInput value={row.name} onChange={(v) => updateRow("catalogue", "addons", i, "name", v)} /></Td><Td><InlineInput value={row.description} onChange={(v) => updateRow("catalogue", "addons", i, "description", v)} /></Td><Td><InlineSelect value={row.status} options={[["draft","Draft"],["active","Active"],["retired","Retired"]]} onChange={(v) => updateRow("catalogue", "addons", i, "status", v)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("catalogue", "addons", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
        </section>}

        {section === "trials" && <section className="mt-5 space-y-3"><SectionTitle title="Trial policy" description="Duration and activation trigger are contract-fixed: 14 days from subscription activation." action={() => addRow("trial_policy", "trials", { planCode: "essential", planVersion: 1, policyVersion: 1, enabled: false, durationDays: 14, startTrigger: "subscription_activated", effectiveFrom: null, effectiveTo: null })} />
          <TableWrap><thead><tr><Th>Plan</Th><Th>Plan version</Th><Th>Policy version</Th><Th>Enabled</Th><Th>Duration</Th><Th>Start trigger</Th><Th>Effective from</Th><Th>Effective to</Th><Th /></tr></thead><tbody>{trials.map((row, i) => <tr key={i}><Td><InlineSelect value={row.planCode} options={planOptions} onChange={(v) => updateRow("trial_policy", "trials", i, "planCode", v)} /></Td><Td><InlineInput type="number" value={row.planVersion} onChange={(v) => updateRow("trial_policy", "trials", i, "planVersion", Number(v))} /></Td><Td><InlineInput type="number" value={row.policyVersion} onChange={(v) => updateRow("trial_policy", "trials", i, "policyVersion", Number(v))} /></Td><Td><InlineSelect value={row.enabled ? "true" : "false"} options={[["false","Disabled"],["true","Enabled"]]} onChange={(v) => updateRow("trial_policy", "trials", i, "enabled", v === "true")} /></Td><Td>14 days</Td><Td>Subscription activation</Td><Td><InlineInput type="date" value={row.effectiveFrom} onChange={(v) => updateRow("trial_policy", "trials", i, "effectiveFrom", v || null)} /></Td><Td><InlineInput type="date" value={row.effectiveTo} onChange={(v) => updateRow("trial_policy", "trials", i, "effectiveTo", v || null)} /></Td><Td><button className="text-destructive underline" onClick={() => removeRow("trial_policy", "trials", i)}>Remove</button></Td></tr>)}</tbody></TableWrap>
        </section>}

        <div className="mt-6 space-y-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className={headingClass}>Configuration controls</h3><p className={mutedClass}>Save a new immutable version. Publishing invokes server-side schema and completeness validation.</p></div><button type="button" className="text-xs text-primary underline" onClick={() => { setAdvanced((value) => !value); setJsonText(JSON.stringify(payload, null, 2)); }}>{advanced ? "Return to structured editor" : "Advanced JSON editor"}</button></div>
          {advanced && <textarea aria-label="Advanced commercial policy JSON" value={jsonText} onChange={(event) => setJsonText(event.target.value)} spellCheck={false} className="min-h-72 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5" />}
          <div className="flex flex-wrap items-center gap-3"><label className="text-sm" htmlFor="commercial-policy-status">Save as</label><select id="commercial-policy-status" value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published")} className={fieldClass + " mt-0 w-auto"}><option value="draft">Draft</option><option value="published">Publish current version</option></select><button type="button" disabled={saving || loading} onClick={() => void save()} className={primaryClass}>{saving ? "Saving…" : status === "published" ? "Publish version" : "Save draft"}</button><button type="button" disabled={loading} onClick={() => void refresh()} className={buttonClass}>Refresh</button></div>
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
          {notice && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm">{notice}</p>}
        </div>
      </main>

      <section className={panelClass}><div className="flex items-center justify-between gap-3"><div><h2 className={headingClass}>Version history</h2><p className={mutedClass}>Append-only policy versions for {selected.policy.replace("_", " ")}.</p></div><span className="text-xs text-muted-foreground">{currentRows.length} versions</span></div>
        {currentRows.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No configuration has been authored for this policy family.</p> : <div className="mt-3 space-y-2">{currentRows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"><div><strong>Version {row.version}</strong><span className="ml-2 rounded-full bg-muted px-2 py-1 text-xs">{row.is_current ? "Current" : row.status}</span><p className={mutedClass}>{new Date(row.created_at).toLocaleString()}</p></div><button className="text-primary underline" onClick={() => { setJsonText(JSON.stringify(row.payload, null, 2)); setAdvanced(true); setStatus("draft"); }}>Inspect version JSON</button></div>)}</div>}
      </section>

      <section className={panelClass}><h2 className={headingClass}>Policy change audit</h2><p className={mutedClass}>Latest 100 founder commercial policy configuration events.</p>
        {audit.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No policy changes recorded.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs"><thead><tr className="border-b border-border text-muted-foreground"><th className="p-2">Time</th><th className="p-2">Action</th><th className="p-2">Outcome</th><th className="p-2">Reference</th></tr></thead><tbody>{audit.map((event, i) => <tr key={String(event.id ?? i)} className="border-b border-border/70"><td className="p-2">{String(event.occurred_at ?? "")}</td><td className="p-2">{String(event.action ?? "")}</td><td className="p-2">{String(event.outcome ?? "")}</td><td className="p-2 font-mono">{String(event.resource_ref ?? "")}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="rounded-xl border border-border bg-muted/20 p-4"><h2 className={headingClass}>Authority and data boundary</h2><p className={mutedClass}>Founder identity and active founder-tenant membership are revalidated server-side. Database writes independently enforce founder authority. This workspace changes global commercial policy only; it does not modify tenant memberships, subscriptions, customer records or operational property data.</p></section>
    </div>
  );
}
