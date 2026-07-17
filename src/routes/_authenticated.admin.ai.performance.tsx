import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAiPerformance, getAiUsageMetrics, listAiFeedback, listAiHealthEvents, resolveAiHealthEvent } from "@/domains/ai/governance.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai/performance")({
  head: () => ({ meta: [{ title: "AI Performance — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PerformancePage,
});

function PerformancePage() {
  const perfFn = useServerFn(getAiPerformance);
  const usageFn = useServerFn(getAiUsageMetrics);
  const fbFn = useServerFn(listAiFeedback);
  const healthFn = useServerFn(listAiHealthEvents);
  const resolveFn = useServerFn(resolveAiHealthEvent);

  const perf = useQuery({ queryKey: ["ai-perf"], queryFn: () => perfFn() });
  const usage = useQuery({ queryKey: ["ai-usage"], queryFn: () => usageFn() });
  const fb = useQuery({ queryKey: ["ai-fb"], queryFn: () => fbFn() });
  const health = useQuery({ queryKey: ["ai-health"], queryFn: () => healthFn() });

  const p = perf.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">AI Performance</h1>
        <p className="text-sm text-muted-foreground">Usage, quality and health across all AI modules (last 30 days).</p>
      </header>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat label="Requests" value={p?.totalRequests ?? 0} />
        <Stat label="Successful" value={p?.successful ?? 0} />
        <Stat label="Failed" value={p?.failed ?? 0} />
        <Stat label="Avg duration" value={`${p?.avgMs ?? 0} ms`} />
        <Stat label="Active users" value={p?.activeUsers ?? 0} />
        <Stat label="Helpful" value={p?.feedback?.helpful ?? 0} />
        <Stat label="Not helpful" value={p?.feedback?.not_helpful ?? 0} />
        <Stat label="Incorrect" value={p?.feedback?.incorrect ?? 0} />
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-medium">Top tools</h2>
          <ul className="space-y-1 text-sm">
            {(p?.topTools ?? []).map(([t, c]: any) => (
              <li key={t} className="flex justify-between"><span>{t}</span><span className="text-muted-foreground">{c}</span></li>
            ))}
            {!p?.topTools?.length && <li className="text-muted-foreground">No usage yet.</li>}
          </ul>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <h2 className="mb-2 font-medium">Top domains</h2>
          <ul className="space-y-1 text-sm">
            {(p?.topDomains ?? []).map(([d, c]: any) => (
              <li key={d} className="flex justify-between"><span>{d}</span><span className="text-muted-foreground">{c}</span></li>
            ))}
            {!p?.topDomains?.length && <li className="text-muted-foreground">No usage yet.</li>}
          </ul>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Cost & Usage (daily rollup)</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-2">Day</th><th className="p-2">Module</th><th className="p-2">Requests</th>
                <th className="p-2">Success</th><th className="p-2">Failed</th><th className="p-2">Tokens</th><th className="p-2">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {(usage.data ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.day}</td><td className="p-2">{r.module}</td>
                  <td className="p-2">{r.requests}</td><td className="p-2">{r.successful}</td>
                  <td className="p-2">{r.failed}</td><td className="p-2">{r.estimated_tokens}</td>
                  <td className="p-2">${Number(r.estimated_cost_usd).toFixed(4)}</td>
                </tr>
              ))}
              {(usage.data ?? []).length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No usage rollups yet. Metrics accumulate as the AI is used.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Health Events</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">When</th><th className="p-2">Severity</th><th className="p-2">Category</th><th className="p-2">Module</th><th className="p-2">Message</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {(health.data ?? []).map((h: any) => (
                <tr key={h.id} className="border-t">
                  <td className="p-2 text-xs">{new Date(h.created_at).toLocaleString()}</td>
                  <td className="p-2"><Badge variant={h.severity === "error" ? "destructive" : "outline"}>{h.severity}</Badge></td>
                  <td className="p-2">{h.category}</td>
                  <td className="p-2">{h.module ?? "—"}</td>
                  <td className="p-2">{h.message}</td>
                  <td className="p-2 text-right">
                    {!h.resolved && (
                      <Button size="sm" variant="outline" onClick={async () => {
                        await resolveFn({ data: { id: h.id, resolved: true } });
                        toast.success("Marked resolved"); health.refetch();
                      }}>Resolve</Button>
                    )}
                    {h.resolved && <Badge variant="outline">Resolved</Badge>}
                  </td>
                </tr>
              ))}
              {(health.data ?? []).length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No health events.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Recent Feedback</h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr><th className="p-2">When</th><th className="p-2">Module</th><th className="p-2">Rating</th><th className="p-2">Comment</th></tr>
            </thead>
            <tbody>
              {(fb.data ?? []).map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="p-2">{r.module ?? "—"}</td>
                  <td className="p-2"><Badge variant="outline">{r.rating}</Badge></td>
                  <td className="p-2 text-xs">{r.comment ?? "—"}</td>
                </tr>
              ))}
              {(fb.data ?? []).length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No feedback yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}