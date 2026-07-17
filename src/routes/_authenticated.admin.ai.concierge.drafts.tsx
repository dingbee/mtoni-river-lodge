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
import { Input } from "@/components/ui/input";
import {
  listCommunicationDrafts,
  createCommunicationDraft,
  updateCommunicationDraft,
} from "@/domains/ai/concierge/omnichannel.functions";
import type {
  CommunicationDraftRow,
  CommunicationDraftStatus,
  CommunicationDraftType,
  ConciergeChannel,
} from "@/domains/ai/concierge/omnichannel.types";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/drafts")({
  head: () => ({
    meta: [
      { title: "Communication Drafts — Mtoni AI" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: DraftsPage,
});

function DraftsPage() {
  const listFn = useServerFn(listCommunicationDrafts);
  const createFn = useServerFn(createCommunicationDraft);
  const updateFn = useServerFn(updateCommunicationDraft);
  const qc = useQueryClient();
  const [status, setStatus] = useState<CommunicationDraftStatus | "all">("pending");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    channel: ConciergeChannel;
    draft_type: CommunicationDraftType;
    guest_name: string;
  }>({ channel: "email", draft_type: "welcome", guest_name: "" });

  const list = useQuery({
    queryKey: ["oc.drafts", status],
    queryFn: () => listFn({ data: { status } }),
  });

  const create = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          channel: form.channel,
          draft_type: form.draft_type,
          guest_name: form.guest_name || null,
        },
      }),
    onSuccess: () => {
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["oc.drafts"] });
    },
  });

  const patch = useMutation({
    mutationFn: async (v: {
      id: string;
      status?: CommunicationDraftStatus;
      subject?: string;
      body?: string;
    }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.drafts"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communication Drafts"
        description="AI-authored guest messages awaiting human approval. Nothing sends automatically."
      />

      <SectionCard
        title="Drafts"
        actions={
          <div className="flex items-center gap-2 text-sm">
            {(["pending", "approved", "sent", "rejected", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded px-2 py-1 ${status === s ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {s}
              </button>
            ))}
            <Button size="sm" onClick={() => setCreating((v) => !v)}>
              New draft
            </Button>
          </div>
        }
      >
        {creating && (
          <div className="mb-4 grid gap-2 rounded-lg border p-3 md:grid-cols-4">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={form.channel}
              onChange={(e) =>
                setForm({ ...form, channel: e.target.value as ConciergeChannel })
              }
            >
              <option value="email">email</option>
              <option value="whatsapp">whatsapp</option>
              <option value="web">web</option>
            </select>
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={form.draft_type}
              onChange={(e) =>
                setForm({ ...form, draft_type: e.target.value as CommunicationDraftType })
              }
            >
              <option value="welcome">welcome</option>
              <option value="pre_arrival">pre_arrival</option>
              <option value="activity_intro">activity_intro</option>
              <option value="transfer_info">transfer_info</option>
              <option value="follow_up">follow_up</option>
              <option value="custom">custom</option>
            </select>
            <Input
              placeholder="Guest name (optional)"
              value={form.guest_name}
              onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
            />
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Generate draft"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No drafts.</p>
          )}
          {list.data?.map((d: CommunicationDraftRow) => (
            <DraftCard key={d.id} draft={d} onPatch={patch.mutate} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function DraftCard({
  draft,
  onPatch,
}: {
  draft: CommunicationDraftRow;
  onPatch: (v: {
    id: string;
    status?: CommunicationDraftStatus;
    subject?: string;
    body?: string;
  }) => void;
}) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const dirty = subject !== (draft.subject ?? "") || body !== draft.body;
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="secondary">{draft.channel}</Badge>
        <Badge variant="outline">{draft.draft_type}</Badge>
        <Badge>{draft.status}</Badge>
        <span className="text-muted-foreground">
          {formatDistanceToNow(new Date(draft.created_at), { addSuffix: true })}
        </span>
      </div>
      {draft.channel !== "whatsapp" && (
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Subject"
          className="mb-2"
        />
      )}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={6}
        className="font-sans text-sm"
      />
      {draft.reasoning && (
        <p className="mt-2 text-xs text-muted-foreground">Reasoning: {draft.reasoning}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPatch({ id: draft.id, subject, body, status: "edited" })}
          >
            Save edits
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => onPatch({ id: draft.id, subject, body, status: "approved" })}
        >
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onPatch({ id: draft.id, status: "sent" })}
        >
          Mark sent
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onPatch({ id: draft.id, status: "rejected" })}
        >
          Reject
        </Button>
      </div>
    </div>
  );
}