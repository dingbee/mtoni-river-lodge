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
  listCommunicationDispatchAttempts,
  listConciergeConversations,
  createCommunicationDraft,
  updateCommunicationDraft,
} from "@/domains/ai/concierge/omnichannel.functions";
import {
  dispatchCommunicationDraft,
  recoverCommunicationDispatchAttempt,
} from "@/domains/ai/concierge/dispatch.functions";
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
  const conversationsFn = useServerFn(listConciergeConversations);
  const attemptsFn = useServerFn(listCommunicationDispatchAttempts);
  const dispatchFn = useServerFn(dispatchCommunicationDraft);
  const recoverFn = useServerFn(recoverCommunicationDispatchAttempt);
  const qc = useQueryClient();
  const [status, setStatus] = useState<CommunicationDraftStatus | "all">("pending");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    channel: ConciergeChannel;
    draft_type: CommunicationDraftType;
    session_id: string;
  }>({ channel: "email", draft_type: "welcome", session_id: "" });

  const list = useQuery({
    queryKey: ["oc.drafts", status],
    queryFn: () => listFn({ data: { status } }),
  });
  const conversations = useQuery({
    queryKey: ["oc.draftSessions"],
    queryFn: () => conversationsFn({ data: { channel: "all" } }),
  });
  const selectedSession = conversations.data?.find((session: any) => session.id === form.session_id);
  const attempts = useQuery({
    queryKey: ["oc.dispatchAttempts"],
    queryFn: () => attemptsFn({ data: { limit: 50 } }),
  });

  const create = useMutation({
    mutationFn: async () =>
      createFn({
        data: {
          channel: form.channel,
          draft_type: form.draft_type,
          session_id: form.session_id,
          guest_id: selectedSession?.guest_id ?? null,
          guest_name: selectedSession?.guest_name ?? null,
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
      provider_template_name?: string | null;
      provider_template_language?: string | null;
    }) => updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.drafts"] }),
  });
  const dispatch = useMutation({
    mutationFn: async (id: string) => dispatchFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oc.drafts"] });
      qc.invalidateQueries({ queryKey: ["oc.dispatchAttempts"] });
    },
  });
  const recover = useMutation({
    mutationFn: async (id: string) => recoverFn({
      data: {
        id,
        reason: "Manager reviewed the transient provider failure; approval, recipient consent and provider binding are revalidated before this one-time retry.",
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["oc.drafts"] });
      qc.invalidateQueries({ queryKey: ["oc.dispatchAttempts"] });
    },
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
          <div className="mb-4 grid gap-2 rounded-lg border p-3 md:grid-cols-5">
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={form.channel}
              onChange={(e) =>
                setForm({ ...form, channel: e.target.value as ConciergeChannel, session_id: "" })
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
            <select
              className="rounded border bg-background px-2 py-1 text-sm"
              value={form.session_id}
              onChange={(e) => setForm({ ...form, session_id: e.target.value })}
              disabled={conversations.isLoading}
            >
              <option value="">Select a property conversation</option>
              {conversations.data?.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.guest_name || session.guest_email || session.id.slice(0, 8)} · {session.channel}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !form.session_id}>
              {create.isPending ? "Creating…" : "Generate draft"}
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No drafts.</p>
          )}
          {dispatch.data?.state && <p className="text-sm text-muted-foreground">Latest dispatch result: {dispatch.data.state}{dispatch.data.error ? ` — ${dispatch.data.error}` : ""}</p>}
          {dispatch.error && <p className="text-sm text-destructive">{dispatch.error.message}</p>}
          {recover.error && <p className="text-sm text-destructive">{recover.error.message}</p>}
          {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
          {patch.error && <p className="text-sm text-destructive">{patch.error.message}</p>}
          {list.data?.map((d: CommunicationDraftRow) => (
            <DraftCard key={d.id} draft={d} onPatch={patch.mutate} onDispatch={dispatch.mutate} dispatching={dispatch.isPending} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Recent provider dispatch attempts">
        <p className="mb-3 text-sm text-muted-foreground">Property-scoped provider outcomes, retry windows and terminal failures. Retryable attempts remain blocked until their backoff window expires.</p>
        <div className="space-y-2">
          {attempts.data?.map((attempt: any) => {
            const retryDue = attempt.status === "retryable_failure" && attempt.next_retry_at && Date.parse(attempt.next_retry_at) <= Date.now();
            return <div key={attempt.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{attempt.provider} · {attempt.channel} · attempt {attempt.attempt_number}</div>
                <div className="text-xs text-muted-foreground">{attempt.error_code || attempt.provider_message_id || attempt.id}</div>
                {attempt.error_summary && <div className="mt-1 max-w-2xl text-xs text-destructive">{attempt.error_summary}</div>}
                {attempt.next_retry_at && <div className="mt-1 text-xs text-muted-foreground">Retry after {new Date(attempt.next_retry_at).toLocaleString()}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={attempt.status === "accepted" ? "default" : attempt.status === "permanent_failure" ? "destructive" : "secondary"}>{attempt.status}</Badge>
                {attempt.status === "retryable_failure" && attempt.draft_id && (
                  <Button size="sm" variant="outline" disabled={!retryDue || dispatch.isPending} onClick={() => dispatch.mutate(attempt.draft_id)}>
                    {retryDue ? "Retry dispatch" : "Backoff active"}
                  </Button>
                )}
                {attempt.recoverable === true && (
                  <Button size="sm" variant="outline" disabled={recover.isPending} onClick={() => recover.mutate(attempt.id)}>
                    {recover.isPending ? "Recovering…" : "Retry once"}
                  </Button>
                )}
              </div>
            </div>;
          })}
          {attempts.isLoading && <p className="text-sm text-muted-foreground">Loading dispatch history…</p>}
          {attempts.isError && <p className="text-sm text-destructive">Unable to load dispatch attempts.</p>}
          {!attempts.isLoading && !attempts.data?.length && <p className="text-sm text-muted-foreground">No provider dispatch attempts recorded.</p>}
        </div>
      </SectionCard>
    </div>
  );
}

function DraftCard({
  draft,
  onPatch,
  onDispatch,
  dispatching,
}: {
  draft: CommunicationDraftRow;
  onPatch: (v: {
    id: string;
    status?: CommunicationDraftStatus;
    subject?: string;
    body?: string;
    provider_template_name?: string | null;
    provider_template_language?: string | null;
  }) => void;
  onDispatch: (id: string) => void;
  dispatching: boolean;
}) {
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [body, setBody] = useState(draft.body);
  const [templateName, setTemplateName] = useState(draft.provider_template_name ?? "");
  const [templateLanguage, setTemplateLanguage] = useState(draft.provider_template_language ?? "");
  const dirty = subject !== (draft.subject ?? "") || body !== draft.body ||
    templateName !== (draft.provider_template_name ?? "") ||
    templateLanguage !== (draft.provider_template_language ?? "");
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
      {draft.channel === "whatsapp" && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Approved WhatsApp template name (outside 24h)" />
          <Input value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} placeholder="Template language, e.g. en" />
        </div>
      )}
      {draft.reasoning && (
        <p className="mt-2 text-xs text-muted-foreground">Reasoning: {draft.reasoning}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {dirty && draft.status !== "sent" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onPatch({ id: draft.id, subject, body, provider_template_name: templateName || null, provider_template_language: templateLanguage || null, status: "edited" })}
          >
            Save edits
          </Button>
        )}
        {draft.status !== "sent" && (
          <Button
            size="sm"
            onClick={() => onPatch({ id: draft.id, subject, body, provider_template_name: templateName || null, provider_template_language: templateLanguage || null, status: "approved" })}
          >
            Approve
          </Button>
        )}
        {draft.status === "approved" && (
          <Button size="sm" onClick={() => onDispatch(draft.id)} disabled={dispatching}>
            {dispatching ? "Dispatching…" : "Dispatch approved message"}
          </Button>
        )}
        {draft.status !== "sent" && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onPatch({ id: draft.id, status: "rejected" })}
          >
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}