import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  listConciergeMemories,
  decideConciergeMemory,
  deleteConciergeMemory,
  editConciergeMemory,
  getMemoryAnalytics,
} from "@/domains/ai/concierge/memory.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/memory")({
  head: () => ({
    meta: [{ title: "Guest Memory — AI Concierge" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: MemoryPage,
});

type Filter = "pending" | "approved" | "rejected" | "all";

function MemoryPage() {
  const listFn = useServerFn(listConciergeMemories);
  const analyticsFn = useServerFn(getMemoryAnalytics);
  const decideFn = useServerFn(decideConciergeMemory);
  const editFn = useServerFn(editConciergeMemory);
  const deleteFn = useServerFn(deleteConciergeMemory);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");
  const [editing, setEditing] = useState<Record<string, string>>({});

  const analyticsQ = useQuery({
    queryKey: ["memory-analytics"],
    queryFn: () => analyticsFn(),
  });
  const listQ = useQuery({
    queryKey: ["memories", filter],
    queryFn: () =>
      listFn({ data: filter === "all" ? {} : { status: filter } }),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["memories"] });
    qc.invalidateQueries({ queryKey: ["memory-analytics"] });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest Memory"
        description="Review and approve hospitality memories the concierge has suggested."
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Approved" value={analyticsQ.data?.approved ?? 0} />
        <StatCard label="Pending" value={analyticsQ.data?.pending ?? 0} />
        <StatCard label="Rejected" value={analyticsQ.data?.rejected ?? 0} />
        <StatCard label="Returning visitors" value={`${analyticsQ.data?.returningVisitorPct ?? 0}%`} />
      </div>

      <SectionCard title="Filter">
        <div className="flex gap-2 flex-wrap">
          {(["pending", "approved", "rejected", "all"] as Filter[]).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
            >
              {f}
            </Button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Memories">
        {listQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (listQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No memories in this bucket.</p>
        ) : (
          <div className="space-y-3">
            {(listQ.data as any[]).map((m) => {
              const draft = editing[m.id] ?? m.memory_value;
              return (
                <div key={m.id} className="border rounded-md p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <Badge variant="outline">{m.memory_type}</Badge>
                    <Badge variant="secondary">{m.status}</Badge>
                    <span>{m.memory_key}</span>
                    <span>· conf {Number(m.confidence).toFixed(2)}</span>
                    <span>· source {m.source}</span>
                    {m.guest?.full_name && <span>· {m.guest.full_name}</span>}
                    {!m.guest && m.session?.guest_email && <span>· {m.session.guest_email}</span>}
                  </div>
                  <Textarea
                    value={draft}
                    onChange={(e) => setEditing((s) => ({ ...s, [m.id]: e.target.value }))}
                    rows={2}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (draft !== m.memory_value) {
                          await editFn({ data: { id: m.id, memoryValue: draft } });
                        }
                        await decideFn({ data: { id: m.id, decision: "approved" } });
                        refresh();
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await decideFn({ data: { id: m.id, decision: "rejected" } });
                        refresh();
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (draft !== m.memory_value) {
                          await editFn({ data: { id: m.id, memoryValue: draft } });
                          refresh();
                        }
                      }}
                    >
                      Save edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={async () => {
                        await deleteFn({ data: { id: m.id } });
                        refresh();
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Top approved preferences">
        {(analyticsQ.data?.topPreferences ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No approved memories yet.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {(analyticsQ.data?.topPreferences ?? []).map((p) => (
              <li key={p.memory_key} className="flex justify-between">
                <span>{p.memory_key}</span>
                <span className="text-muted-foreground">{p.count}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Unused placeholder to silence linters if Input becomes needed later */}
      <div className="hidden">
        <Input readOnly value="" />
      </div>
    </div>
  );
}