import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getFinancialReport } from "@/domains/finance/finance.functions";

export const Route = createFileRoute("/_authenticated/admin/finance/reports")({
  head: () => ({
    meta: [
      { title: "Financial Reports — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Reports,
});

const KINDS = ["daily", "weekly", "monthly", "occupancy", "source", "tax"] as const;

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const fn = useServerFn(getFinancialReport);
  const [kind, setKind] = useState<(typeof KINDS)[number]>("monthly");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const { data, isLoading } = useQuery({
    queryKey: ["finance.report", kind, from, to],
    queryFn: () => fn({ data: { kind, from, to } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="Management reports with CSV export."
        actions={
          data && (
            <Button size="sm" variant="outline" onClick={() => download(`report-${kind}-${from}-${to}.csv`, toCsv(data.rows as never))}>
              <Download className="mr-1 h-3 w-3" /> Export CSV
            </Button>
          )
        }
      />
      <SectionCard>
        <div className="flex flex-wrap gap-3">
          <select className="rounded border border-border bg-background px-2 py-1 text-sm" value={kind} onChange={(e) => setKind(e.target.value as never)}>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </SectionCard>

      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <SectionCard title={`${kind} · ${data.rows.length} rows`}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1">Reference</th>
                  <th>Check-in</th>
                  <th>Nights</th>
                  <th>Total</th>
                  <th>Taxes</th>
                  <th>Source</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 200).map((r) => (
                  <tr key={r.reference} className="border-t border-border">
                    <td className="py-1 font-mono">{r.reference}</td>
                    <td>{r.check_in}</td>
                    <td>{r.nights}</td>
                    <td>{r.currency} {Number(r.total).toFixed(2)}</td>
                    <td>{Number(r.taxes ?? 0).toFixed(2)}</td>
                    <td>{r.source}</td>
                    <td>{r.country ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}
