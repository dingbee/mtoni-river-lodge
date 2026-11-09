import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  listFounderCommercialPolicies,
  listFounderCommercialPolicyAudit,
  saveFounderCommercialPolicy,
} from "@/domains/commercial/founder-policy.functions";

type PolicyType = "catalogue" | "pricing" | "composition" | "trial_policy";
type PolicyRow = {
  id: string;
  policy_type: PolicyType;
  version: number;
  status: "draft" | "published" | "retired";
  payload: unknown;
  effective_from: string | null;
  effective_to: string | null;
  created_at: string;
  is_current: boolean;
};

const TYPES: { value: PolicyType; label: string; description: string; template: string }[] = [
  {
    value: "catalogue",
    label: "Plan catalogue",
    description: "Define Essential, Professional and Enterprise plans, version records, modules, add-ons and founder-controlled capability quota policies.",
    template: JSON.stringify({ plans: [], planVersions: [], modules: [], planModules: [], addons: [] }, null, 2),
  },
  {
    value: "pricing",
    label: "Pricing",
    description: "Configure TZS/USD monthly and annual prices, hybrid property pricing and add-on charges. No FX conversion is applied.",
    template: JSON.stringify({ planPrices: [], addonPrices: [] }, null, 2),
  },
  {
    value: "composition",
    label: "Package composition",
    description: "Define included modules, optional add-ons and explicit compatibility rules.",
    template: JSON.stringify({ compositions: [], compatibilityRules: [] }, null, 2),
  },
  {
    value: "trial_policy",
    label: "Trial policies",
    description: "Configure plan-version trial policies. The contract fixes duration at 14 days and trigger at subscription activation.",
    template: JSON.stringify([], null, 2),
  },
];

export const Route = createFileRoute("/_authenticated/admin/commercial")({
  component: FounderCommercialAdministration,
});

function FounderCommercialAdministration() {
  const listPoliciesFn = useServerFn(listFounderCommercialPolicies);
  const listAuditFn = useServerFn(listFounderCommercialPolicyAudit);
  const savePolicyFn = useServerFn(saveFounderCommercialPolicy);
  const [selected, setSelected] = useState<PolicyType>("catalogue");
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [payloadText, setPayloadText] = useState(TYPES[0]!.template);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedType = TYPES.find((item) => item.value === selected)!;
  const selectedRows = useMemo(
    () => policies.filter((row) => row.policy_type === selected).sort((a, b) => b.version - a.version),
    [policies, selected],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, auditRows] = await Promise.all([
        listPoliciesFn(),
        listAuditFn(),
      ]);
      setPolicies(rows as PolicyRow[]);
      setAudit(auditRows as Array<Record<string, unknown>>);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Founder authorization or configuration lookup failed.");
    } finally {
      setLoading(false);
    }
  }, [listPoliciesFn, listAuditFn]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const currentRows = policies.filter((row) => row.policy_type === selected);
    const newestDraft = currentRows
      .filter((row) => row.status === "draft")
      .sort((a, b) => b.version - a.version)[0];
    const current = newestDraft
      ?? currentRows.find((row) => row.is_current)
      ?? currentRows.sort((a, b) => b.version - a.version)[0];
    setPayloadText(current ? JSON.stringify(current.payload, null, 2) : selectedType.template);
    setStatus("draft");
    setNotice(null);
  }, [selected, policies, selectedType.template]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const payload: unknown = JSON.parse(payloadText);
      const result = await savePolicyFn({
        data: {
          policyType: selected,
          status,
          payload,
          effectiveFrom: null,
          effectiveTo: null,
        },
      });
      setNotice(`${result.policyType} version ${result.version} saved as ${result.status}. A new version was appended; previous versions remain immutable.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The policy could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Nolmark CDMA · Founder authority</p>
        <h1 className="text-2xl font-semibold tracking-tight">Commercial policy administration</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Global StayNas commercial configuration. Changes are versioned and audited. Tenant workspaces cannot author or override these policies.
        </p>
      </header>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Commercial policy types">
          {TYPES.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={selected === item.value}
              onClick={() => setSelected(item.value)}
              className={`rounded-lg border px-3 py-2 text-sm ${selected === item.value ? "border-primary bg-primary/10 font-semibold" : "border-border"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section className="min-w-0 space-y-3">
            <div>
              <h2 className="font-semibold">{selectedType.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{selectedType.description}</p>
            </div>
            <label className="block text-sm font-medium" htmlFor="commercial-policy-json">Policy document (JSON)</label>
            <textarea
              id="commercial-policy-json"
              value={payloadText}
              onChange={(event) => setPayloadText(event.target.value)}
              spellCheck={false}
              className="min-h-[360px] w-full rounded-lg border border-border bg-background p-3 font-mono text-xs leading-5"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm" htmlFor="commercial-policy-status">Save as</label>
              <select id="commercial-policy-status" value={status} onChange={(event) => setStatus(event.target.value as "draft" | "published")} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                <option value="draft">Draft</option>
                <option value="published">Publish as current version</option>
              </select>
              <button type="button" disabled={saving || loading} onClick={() => void save()} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {saving ? "Saving…" : status === "published" ? "Publish version" : "Save draft"}
              </button>
              <button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-md border border-border px-4 py-2 text-sm">Refresh</button>
            </div>
            {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
            {notice && <p role="status" className="rounded-md border border-border bg-muted/40 p-3 text-sm">{notice}</p>}
          </section>

          <aside className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">Version history</h3>
              {loading ? <p className="mt-2 text-sm text-muted-foreground">Loading…</p> : selectedRows.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">No configuration has been authored. Trial activation remains unavailable until a valid trial policy is published.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {selectedRows.map((row) => (
                    <li key={row.id} className="border-t border-border pt-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <strong>Version {row.version}</strong>
                        <span className="rounded-full bg-muted px-2 py-1">{row.is_current ? "current" : row.status}</span>
                      </div>
                      <p className="mt-1 text-muted-foreground">{new Date(row.created_at).toLocaleString()}</p>
                      <button type="button" onClick={() => { setPayloadText(JSON.stringify(row.payload, null, 2)); setStatus("draft"); }} className="mt-2 text-primary underline">Load into editor</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-lg border border-border p-3">
              <h3 className="text-sm font-semibold">Security boundary</h3>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Every read revalidates the authenticated founder identity and active founder-tenant membership. Writes are schema-validated in the server handler and independently re-authorized by the database RPC. Configuration versions are append-only.
              </p>
            </div>
          </aside>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Policy change audit</h2>
        <p className="mt-1 text-sm text-muted-foreground">Latest 100 founder policy configuration events.</p>
        {audit.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">No policy changes recorded.</p> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead><tr className="border-b border-border text-muted-foreground"><th className="p-2">Time</th><th className="p-2">Action</th><th className="p-2">Outcome</th><th className="p-2">Reference</th></tr></thead>
              <tbody>
                {audit.map((event, index) => (
                  <tr key={String(event.id ?? index)} className="border-b border-border/70">
                    <td className="p-2">{String(event.occurred_at ?? "")}</td>
                    <td className="p-2">{String(event.action ?? "")}</td>
                    <td className="p-2">{String(event.outcome ?? "")}</td>
                    <td className="p-2 font-mono">{String(event.resource_ref ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
