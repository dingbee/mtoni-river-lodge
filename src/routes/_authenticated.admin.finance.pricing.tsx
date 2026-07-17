import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listPricingRules,
  savePricingRule,
  deletePricingRule,
} from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/pricing")({
  head: () => ({
    meta: [
      { title: "Rate & Pricing — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Pricing,
});

const RULE_TYPES = ["seasonal", "weekend", "promo", "corporate", "package", "child", "extra_guest", "min_stay", "blackout"] as const;

function Pricing() {
  const listFn = useServerFn(listPricingRules);
  const saveFn = useServerFn(savePricingRule);
  const delFn = useServerFn(deletePricingRule);
  const qc = useQueryClient();
  const { data: rules, isLoading } = useQuery({ queryKey: ["finance.pricing"], queryFn: () => listFn() });

  const [name, setName] = useState("");
  const [ruleType, setRuleType] = useState<(typeof RULE_TYPES)[number]>("seasonal");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [adjustKind, setAdjustKind] = useState<"percent" | "fixed" | "override">("percent");
  const [adjustValue, setAdjustValue] = useState("");
  const [minStay, setMinStay] = useState("");
  const [priority, setPriority] = useState("100");

  const create = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name,
          rule_type: ruleType,
          scope: "all",
          starts_on: startsOn || null,
          ends_on: endsOn || null,
          adjust_kind: adjustValue ? adjustKind : null,
          adjust_value: adjustValue ? Number(adjustValue) : null,
          min_stay_nights: minStay ? Number(minStay) : null,
          priority: Number(priority) || 100,
          active: true,
        },
      }),
    onSuccess: () => {
      toast.success("Rule saved");
      setName("");
      setAdjustValue("");
      setMinStay("");
      qc.invalidateQueries({ queryKey: ["finance.pricing"] });
    },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance.pricing"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Rate & Pricing Manager" description="Seasonal, promotional and corporate rate rules." />
      <SectionCard title="Add rule">
        <div className="grid gap-2 md:grid-cols-4">
          <Input placeholder="Rule name" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={ruleType} onChange={(e) => setRuleType(e.target.value as never)}>
            {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <Input type="date" placeholder="Starts" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          <Input type="date" placeholder="Ends" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={adjustKind} onChange={(e) => setAdjustKind(e.target.value as never)}>
            <option value="percent">Percent</option>
            <option value="fixed">Fixed</option>
            <option value="override">Override</option>
          </select>
          <Input placeholder="Adjust value" type="number" value={adjustValue} onChange={(e) => setAdjustValue(e.target.value)} />
          <Input placeholder="Min stay nights" type="number" value={minStay} onChange={(e) => setMinStay(e.target.value)} />
          <Input placeholder="Priority" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
        <Button size="sm" className="mt-2" disabled={!name || create.isPending} onClick={() => create.mutate()}>
          <Plus className="mr-1 h-3 w-3" /> Add rule
        </Button>
      </SectionCard>

      {isLoading ? (
        <LoadingState />
      ) : (
        <SectionCard title="Active rules">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Type</th>
                  <th>Range</th>
                  <th>Adjust</th>
                  <th>Priority</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(rules ?? []).map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-2">{r.name}</td>
                    <td><Badge variant="secondary">{r.rule_type}</Badge></td>
                    <td>{r.starts_on ?? "—"} → {r.ends_on ?? "—"}</td>
                    <td>{r.adjust_kind ? `${r.adjust_kind} ${r.adjust_value}` : "—"}</td>
                    <td>{r.priority}</td>
                    <td><Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}><Trash2 className="h-3 w-3" /></Button></td>
                  </tr>
                ))}
                {!rules?.length && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No pricing rules yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Rules are stored and available to the booking engine. Existing booking calculations remain unchanged until a rule is explicitly wired into a rate resolver.
          </p>
        </SectionCard>
      )}
    </div>
  );
}