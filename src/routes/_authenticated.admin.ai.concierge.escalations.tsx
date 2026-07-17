import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listEscalations,
  updateEscalation,
} from "@/domains/ai/concierge/omnichannel.functions";
import type {
  EscalationRow,
  EscalationStatus,
} from "@/domains/ai/concierge/omnichannel.types";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/escalations")({
  head: () => ({
    meta: [
      { title: "Escalations — Mtoni AI" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: EscalationsPage,
});

function EscalationsPage() {
  const listFn = useServerFn(listEscalations);
  const updateFn = useServerFn(updateEscalation);
  const qc = useQueryClient();
  const [status, setStatus] = useState<EscalationStatus | "all">("open");
  const list = useQuery({
    queryKey: ["oc.escalations", status],
    queryFn: () => listFn({ data: { status } }),
  });
  const patch = useMutation({
    mutationFn: async (v: {
      id: string;
      status?: EscalationStatus;
      resolution_notes?: string;
    }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.escalations"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Escalations"
        description="Conversations flagged for human attention across every channel."
      />
      <SectionCard
        title="Queue"
        actions={
          <div className="flex gap-2 text-sm">
            {(["open", "assigned", "in_progress", "resolved", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded px-2 py-1 ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      >
        <div className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No escalations.</p>
          )}
          {list.data?.map((e: EscalationRow) => (
            <EscalationCard key={e.id} row={e} onPatch={patch.mutate} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function EscalationCard({
  row,
  onPatch,
}: {
  row: EscalationRow;
  onPatch: (v: {
    id: string;
    status?: EscalationStatus;
    resolution_notes?: string;
  }) => void;
}) {
  const [notes, setNotes] = useState(row.resolution_notes ?? "");
  return (
    <div className="rounded-lg border p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{row.channel}</Badge>
        <Badge variant="outline">{row.reason}</Badge>
        <Badge>{row.status}</Badge>
        <span className="text-muted-foreground">
          P{row.priority} · {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
        </span>
        {typeof row.ai_confidence === "number" && (
          <span className="text-muted-foreground">
            conf {Math.round(row.ai_confidence * 100)}%
          </span>
        )}
      </div>
      {row.summary && <p className="mb-2 whitespace-pre-wrap">{row.summary}</p>}
      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={3}
        placeholder="Resolution notes…"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() =>
            onPatch({ id: row.id, status: "in_progress", resolution_notes: notes })
          }
        >
          Take
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            onPatch({ id: row.id, status: "resolved", resolution_notes: notes })
          }
        >
          Resolve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onPatch({ id: row.id, status: "dismissed", resolution_notes: notes })
          }
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}