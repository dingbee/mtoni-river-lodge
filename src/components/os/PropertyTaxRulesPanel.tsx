import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/os/SectionCard";
import { deactivatePropertyTaxRule, listPropertyTaxRules, savePropertyTaxRule } from "@/lib/property-tax-rules.functions";

type CalculationType = "inclusive_percent" | "exclusive_percent" | "fixed_per_night" | "fixed_per_booking";
type AppliesTo = "accommodation" | "extras" | "all";
type TaxRule = {
  id: string; name: string; tax_code: string | null; calculation_type: CalculationType; rate: number;
  currency: string | null; applies_to: AppliesTo; is_compound: boolean; active: boolean;
  valid_from: string | null; valid_to: string | null;
};

const emptyForm = (currency: string) => ({
  name: "", taxCode: "", calculationType: "exclusive_percent" as CalculationType,
  rate: "0", currency, appliesTo: "accommodation" as AppliesTo,
  isCompound: false, active: true, validFrom: "", validTo: "",
});

export function PropertyTaxRulesPanel({ currency }: { currency: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listPropertyTaxRules);
  const saveFn = useServerFn(savePropertyTaxRule);
  const deactivateFn = useServerFn(deactivatePropertyTaxRule);
  const [form, setForm] = useState(emptyForm(currency));
  const [editingId, setEditingId] = useState<string | null>(null);
  const rules = useQuery({ queryKey: ["property-tax-rules"], queryFn: () => listFn() });

  const save = useMutation({
    mutationFn: () => saveFn({ data: {
      ...(editingId ? { id: editingId } : {}),
      name: form.name, taxCode: form.taxCode,
      calculationType: form.calculationType, rate: Number(form.rate),
      currency: form.currency, appliesTo: form.appliesTo,
      isCompound: form.isCompound, active: form.active,
      validFrom: form.validFrom, validTo: form.validTo,
    } }),
    onSuccess: () => {
      setForm(emptyForm(currency)); setEditingId(null);
      toast.success("Property tax rule saved");
      qc.invalidateQueries({ queryKey: ["property-tax-rules"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateFn({ data: { id } }),
    onSuccess: () => { toast.success("Tax rule deactivated"); qc.invalidateQueries({ queryKey: ["property-tax-rules"] }); },
    onError: (error: Error) => toast.error(error.message),
  });

  const edit = (rule: TaxRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name, taxCode: rule.tax_code ?? "", calculationType: rule.calculation_type,
      rate: String(rule.rate), currency: rule.currency ?? currency, appliesTo: rule.applies_to,
      isCompound: rule.is_compound, active: rule.active,
      validFrom: rule.valid_from ?? "", validTo: rule.valid_to ?? "",
    });
  };
  const fixed = form.calculationType === "fixed_per_night" || form.calculationType === "fixed_per_booking";
  const field = "mt-1 w-full rounded-md border border-[color:var(--os-hairline)] bg-[color:var(--os-surface)] px-3 py-2 text-sm text-[color:var(--os-ink)]";

  return <SectionCard title="Taxes & Charges" description={`Configure the selected property's tax rules. Booking totals use these rules at the service date; no tax rate is assumed or inserted automatically. Currency: ${currency}.`}>
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        {rules.isLoading ? <p className="text-sm text-muted-foreground">Loading tax rules…</p>
          : rules.isError ? <p className="text-sm text-destructive">Unable to load tax rules. Verify owner or manager access.</p>
          : (rules.data ?? []).length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No property tax rules configured. Booking totals will show no tax until approved rules are entered.</p>
          : (rules.data as TaxRule[]).map(rule => <div key={rule.id} className="rounded-md border border-[color:var(--os-hairline)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium text-sm">{rule.name}</div>
              <Badge variant={rule.active ? "secondary" : "outline"}>{rule.active ? "Active" : "Inactive"}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{rule.calculation_type.replaceAll("_", " ")} · {rule.applies_to} · {rule.rate}{rule.calculation_type.includes("percent") ? "%" : ` ${rule.currency ?? currency}`}{rule.is_compound ? " · compound" : ""}</p>
            {(rule.valid_from || rule.valid_to) && <p className="mt-1 text-xs text-muted-foreground">Effective {rule.valid_from ?? "any date"} — {rule.valid_to ?? "open-ended"}</p>}
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => edit(rule)}>Edit</Button>
              {rule.active && <Button type="button" size="sm" variant="ghost" onClick={() => deactivate.mutate(rule.id)} disabled={deactivate.isPending}>Deactivate</Button>}
            </div>
          </div>)}
      </div>
      <form className="grid content-start gap-3 rounded-md border border-[color:var(--os-hairline)] p-4" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
        <div className="font-medium text-sm">{editingId ? "Edit tax rule" : "Add tax rule"}</div>
        <label className="text-xs">Rule name<input className={field} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required maxLength={120} /></label>
        <label className="text-xs">Tax code (optional)<input className={field} value={form.taxCode} onChange={e => setForm({ ...form, taxCode: e.target.value })} maxLength={40} /></label>
        <label className="text-xs">Calculation type<select className={field} value={form.calculationType} onChange={e => setForm({ ...form, calculationType: e.target.value as CalculationType })}>
          <option value="inclusive_percent">Inclusive percentage</option><option value="exclusive_percent">Exclusive percentage</option>
          <option value="fixed_per_night">Fixed per night</option><option value="fixed_per_booking">Fixed per booking</option>
        </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Rate / amount<input className={field} type="number" min="0" step="0.01" value={form.rate} onChange={e => setForm({ ...form, rate: e.target.value })} required /></label>
          <label className="text-xs">Currency<input className={field} value={fixed ? form.currency : form.currency} onChange={e => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} placeholder={currency} /></label>
        </div>
        <label className="text-xs">Applies to<select className={field} value={form.appliesTo} onChange={e => setForm({ ...form, appliesTo: e.target.value as AppliesTo })}>
          <option value="accommodation">Accommodation</option><option value="extras">Extras</option><option value="all">Accommodation + extras</option>
        </select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs">Valid from<input className={field} type="date" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} /></label>
          <label className="text-xs">Valid to<input className={field} type="date" value={form.validTo} onChange={e => setForm({ ...form, validTo: e.target.value })} /></label>
        </div>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.isCompound} onChange={e => setForm({ ...form, isCompound: e.target.checked })} /> Compound tax (calculated on prior tax amounts)</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : editingId ? "Update rule" : "Add rule"}</Button>
          {editingId && <Button type="button" variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm(currency)); }}>Cancel edit</Button>}
        </div>
      </form>
    </div>
  </SectionCard>;
}
