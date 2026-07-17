import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  getAiSystems,
  listAiConfigurations,
  updateAiConfiguration,
  listAiPrompts,
  createAiPromptVersion,
  activateAiPromptVersion,
  getAiScopeContext,
} from "@/domains/ai/governance.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/governance")({
  head: () => ({ meta: [{ title: "AI Governance — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: GovernancePage,
});

function GovernancePage() {
  const systemsFn = useServerFn(getAiSystems);
  const configsFn = useServerFn(listAiConfigurations);
  const promptsFn = useServerFn(listAiPrompts);
  const scopeFn = useServerFn(getAiScopeContext);
  const systems = useQuery({ queryKey: ["ai-systems"], queryFn: () => systemsFn() });
  const configs = useQuery({ queryKey: ["ai-configs"], queryFn: () => configsFn() });
  const prompts = useQuery({ queryKey: ["ai-prompts"], queryFn: () => promptsFn() });
  const scope = useQuery({ queryKey: ["ai-scope"], queryFn: () => scopeFn() });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">AI Governance Centre</h1>
        <p className="text-sm text-muted-foreground">Monitor AI systems, manage configuration and prompt versions.</p>
      </header>

      <section className="space-y-2">
        <h2 className="font-medium">AI Systems</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {(systems.data ?? []).map((s: any) => (
            <div key={s.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{s.label}</div>
                <Badge variant={s.health === "healthy" ? "outline" : "destructive"}>{s.health}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                <div>Requests (7d): {s.requests_7d}</div>
                <div>Failed (7d): {s.failed_7d}</div>
                <div>Last used: {s.last_used ? new Date(s.last_used).toLocaleString() : "—"}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ConfigSection rows={configs.data ?? []} onSaved={() => configs.refetch()} />
      <PromptSection rows={prompts.data ?? []} onChanged={() => prompts.refetch()} />

      <section className="space-y-2">
        <h2 className="font-medium">Deployment Scope</h2>
        <div className="rounded-xl border bg-card p-4 text-sm">
          <div className="mb-2">
            <strong>Organisations:</strong>{" "}
            {(scope.data?.organisations ?? []).map((o: any) => o.name).join(", ") || "—"}
          </div>
          <div>
            <strong>Properties:</strong>{" "}
            {(scope.data?.properties ?? []).map((p: any) => p.name).join(", ") || "—"}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Placeholder for future multi-property deployment. Existing data continues to operate as a single property.
          </p>
        </div>
      </section>
    </div>
  );
}

function ConfigSection({ rows, onSaved }: { rows: any[]; onSaved: () => void }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateAiConfiguration);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: async (row: any) => {
      const raw = edits[row.id] ?? JSON.stringify(row.setting_value);
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("Invalid JSON"); }
      return updateFn({ data: { id: row.id, setting_value: parsed } });
    },
    onSuccess: () => { toast.success("Configuration updated"); onSaved(); qc.invalidateQueries({ queryKey: ["ai-configs"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  return (
    <section className="space-y-2">
      <h2 className="font-medium">AI Configuration</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Module</th><th className="p-2">Setting</th>
              <th className="p-2">Value (JSON)</th><th className="p-2">Version</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 font-medium">{r.module}</td>
                <td className="p-2">{r.setting_key}</td>
                <td className="p-2">
                  <Input
                    className="font-mono text-xs"
                    defaultValue={JSON.stringify(r.setting_value)}
                    onChange={(e) => setEdits((s) => ({ ...s, [r.id]: e.target.value }))}
                  />
                  {r.description && <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>}
                </td>
                <td className="p-2">v{r.version}</td>
                <td className="p-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => save.mutate(r)}>Save</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PromptSection({ rows, onChanged }: { rows: any[]; onChanged: () => void }) {
  const createFn = useServerFn(createAiPromptVersion);
  const activateFn = useServerFn(activateAiPromptVersion);
  const [module, setModule] = useState("guest");
  const [key, setKey] = useState("system");
  const [text, setText] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: async () => createFn({ data: { module, prompt_key: key, prompt_text: text, notes } }),
    onSuccess: () => { toast.success("Prompt version created"); setText(""); setNotes(""); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  const activate = useMutation({
    mutationFn: async (id: string) => activateFn({ data: { id } }),
    onSuccess: () => { toast.success("Version activated"); onChanged(); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <section className="space-y-3">
      <h2 className="font-medium">Prompt & Instruction Management</h2>
      <div className="rounded-xl border bg-card p-4">
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={module} onChange={(e) => setModule(e.target.value)} placeholder="module (guest/revenue/marketing/executive)" />
          <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="prompt key (e.g. system)" />
        </div>
        <Textarea className="mt-2 min-h-32 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="System / domain instructions…" />
        <Input className="mt-2" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
        <div className="mt-2 text-right">
          <Button size="sm" disabled={!text.trim()} onClick={() => create.mutate()}>Create version</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Module</th><th className="p-2">Key</th><th className="p-2">Version</th>
              <th className="p-2">Active</th><th className="p-2">Approved</th><th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2">{r.module}</td>
                <td className="p-2">{r.prompt_key}</td>
                <td className="p-2">v{r.version}</td>
                <td className="p-2">{r.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>}</td>
                <td className="p-2 text-xs">{r.approved_at ? new Date(r.approved_at).toLocaleDateString() : "—"}</td>
                <td className="p-2 text-right">
                  {!r.is_active && <Button size="sm" variant="outline" onClick={() => activate.mutate(r.id)}>Activate</Button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No prompt versions yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}