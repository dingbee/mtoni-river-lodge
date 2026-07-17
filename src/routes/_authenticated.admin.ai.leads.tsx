import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { listConciergeLeads, updateConciergeLead } from "@/domains/ai/concierge/concierge.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/leads")({
  head: () => ({ meta: [{ title: "Concierge Leads — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: LeadsPage,
});

const STATUSES = ["new", "contacted", "qualified", "converted", "closed"] as const;

function LeadsPage() {
  const listFn = useServerFn(listConciergeLeads);
  const updateFn = useServerFn(updateConciergeLead);
  const qc = useQueryClient();

  const leads = useQuery({ queryKey: ["concierge.leads"], queryFn: () => listFn() });
  const mutate = useMutation({
    mutationFn: (v: { id: string; status?: string; notes?: string | null }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["concierge.leads"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Concierge Leads" description="Qualified booking leads captured by the AI Concierge." />
      <SectionCard title="All leads">
        {leads.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {leads.data && leads.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No leads yet.</p>
        )}
        {leads.data && leads.data.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="p-2">Guest</th>
                  <th className="p-2">Travel</th>
                  <th className="p-2">Party</th>
                  <th className="p-2">Interests</th>
                  <th className="p-2">Intent</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Received</th>
                </tr>
              </thead>
              <tbody>
                {leads.data.map((l: any) => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2">
                      <div className="font-medium">{l.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.email ?? l.phone ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{l.country ?? ""}</div>
                    </td>
                    <td className="p-2 text-xs">
                      {l.travel_period_start ?? "?"} → {l.travel_period_end ?? "?"}
                    </td>
                    <td className="p-2 text-xs">
                      {l.party_adults ?? 0}A · {l.party_children ?? 0}C
                    </td>
                    <td className="p-2 text-xs">{(l.interests ?? []).join(", ") || "—"}</td>
                    <td className="p-2">
                      <Badge variant={l.intent_level === "high" ? "default" : "secondary"}>{l.intent_level}</Badge>
                    </td>
                    <td className="p-2">
                      <select
                        className="rounded border bg-background px-2 py-1 text-xs"
                        value={l.status}
                        onChange={(e) => mutate.mutate({ id: l.id, status: e.target.value })}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}