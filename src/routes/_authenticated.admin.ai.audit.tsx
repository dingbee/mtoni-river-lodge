import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { searchAiAudit, submitAiFeedback } from "@/domains/ai/governance.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/audit")({
  head: () => ({ meta: [{ title: "AI Audit — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AuditPage,
});

function AuditPage() {
  const searchFn = useServerFn(searchAiAudit);
  const feedbackFn = useServerFn(submitAiFeedback);
  const [filters, setFilters] = useState<{ module?: string; tool?: string; status?: string; from?: string; to?: string }>({});
  const [rows, setRows] = useState<any[]>([]);

  const search = useMutation({
    mutationFn: async () => searchFn({ data: filters }),
    onSuccess: (r) => setRows(r as any[]),
    onError: (e: any) => toast.error(e?.message ?? "Search failed"),
  });
  const rate = useMutation({
    mutationFn: async (p: { id: string; rating: string; module: string | null }) =>
      feedbackFn({ data: { activity_log_id: p.id, rating: p.rating, module: p.module } }),
    onSuccess: () => toast.success("Feedback recorded"),
  });

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">AI Audit Explorer</h1>
        <p className="text-sm text-muted-foreground">Search AI requests, review evidence and rate responses.</p>
      </header>

      <div className="rounded-xl border bg-card p-3">
        <div className="grid gap-2 md:grid-cols-5">
          <Input placeholder="Module (guests, finance, ...)" onChange={(e) => setFilters((f) => ({ ...f, module: e.target.value || undefined }))} />
          <Input placeholder="Tool" onChange={(e) => setFilters((f) => ({ ...f, tool: e.target.value || undefined }))} />
          <Input placeholder="Status (completed/error)" onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))} />
          <Input type="date" onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined }))} />
          <Input type="date" onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined }))} />
        </div>
        <div className="mt-2 text-right">
          <Button size="sm" onClick={() => search.mutate()}>Search</Button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-xl border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{new Date(r.created_at).toLocaleString()}</Badge>
              <Badge variant={r.status === "completed" ? "outline" : "destructive"}>{r.status}</Badge>
              {r.tool_called && <Badge variant="outline">{r.tool_called}</Badge>}
              {(r.domains_accessed ?? []).map((d: string) => <Badge key={d} variant="outline">{d}</Badge>)}
              <span className="text-muted-foreground">{r.duration_ms ?? 0} ms</span>
            </div>
            <p className="mt-2 text-sm font-medium">{r.question}</p>
            {r.response && <p className="mt-1 text-sm text-muted-foreground">{r.response}</p>}
            <div className="mt-2 flex gap-2">
              {(["helpful","not_helpful","incorrect","needs_improvement"] as const).map((rt) => (
                <Button key={rt} size="sm" variant="outline"
                  onClick={() => rate.mutate({ id: r.id, rating: rt, module: (r.domains_accessed ?? [])[0] ?? null })}>
                  {rt.replace("_", " ")}
                </Button>
              ))}
            </div>
          </div>
        ))}
        {rows.length === 0 && <div className="rounded-xl border bg-card p-6 text-center text-sm text-muted-foreground">Run a search to view AI activity.</div>}
      </div>
    </div>
  );
}