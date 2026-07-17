import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { generateAnalyticsReport, listAnalyticsReports } from "@/domains/analytics/analytics.functions";

export const Route = createFileRoute("/_authenticated/admin/analytics/reports")({
  head: () => ({ meta: [{ title: "Analytics Reports — Mtoni OS" }] }),
  component: Page,
});

const KINDS = ["daily", "weekly", "monthly", "quarterly", "annual"] as const;

function csvOf(r: any): string {
  const p = r.payload?.totals ?? {};
  const rows = [
    ["Report", r.title],
    ["Period", r.period],
    ["Start", r.period_start],
    ["End", r.period_end],
    ["Bookings", p.bookings ?? ""],
    ["Cancelled", p.cancelled ?? ""],
    ["Revenue", p.revenue ?? ""],
    ["Nights", p.nights ?? ""],
  ];
  return rows.map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listAnalyticsReports);
  const genFn = useServerFn(generateAnalyticsReport);
  const { data, isLoading } = useQuery({ queryKey: ["analytics.reports"], queryFn: () => listFn({ data: undefined as any }) });
  const m = useMutation({
    mutationFn: (kind: any) => genFn({ data: { kind } }),
    onSuccess: () => { toast.success("Report generated (draft)."); qc.invalidateQueries({ queryKey: ["analytics.reports"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Generate daily / weekly / monthly / quarterly / annual reports. Drafts only — nothing is auto-emailed." />
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k} variant="secondary" onClick={() => m.mutate(k)} disabled={m.isPending}>Generate {k}</Button>
        ))}
      </div>
      <SectionCard title="Recent reports">
        <div className="space-y-2 text-sm">
          {data.map((r: any) => (
            <div key={r.id} className="rounded border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted-foreground">{r.summary}</div>
                </div>
                <Badge variant="outline">{r.status}</Badge>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => download(`${r.title}.csv`, csvOf(r), "text/csv")}>CSV</Button>
                <Button size="sm" variant="ghost" onClick={() => download(`${r.title}.json`, JSON.stringify(r, null, 2), "application/json")}>JSON</Button>
              </div>
            </div>
          ))}
          {!data.length && <p className="text-muted-foreground">No reports yet.</p>}
        </div>
      </SectionCard>
    </div>
  );
}
