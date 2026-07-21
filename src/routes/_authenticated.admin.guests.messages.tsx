import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Mail, MessageSquare, Globe } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminMutation } from "@/hooks/use-admin-mutation";
import {
  listConciergeConversations,
  listConciergeChannels,
  listCommunicationDrafts,
  listEscalations,
  updateEscalation,
  getOmnichannelAnalytics,
} from "@/domains/ai/concierge/omnichannel.functions";
import type {
  ConciergeChannel,
  EscalationStatus,
} from "@/domains/ai/concierge/omnichannel.types";

export const Route = createFileRoute("/_authenticated/admin/guests/messages")({
  head: () => ({
    meta: [
      { title: "Messages — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MessagesPage,
});

const CHANNEL_META: Record<ConciergeChannel, { label: string; Icon: typeof MessageSquare }> = {
  web: { label: "Web", Icon: Globe },
  whatsapp: { label: "WhatsApp", Icon: MessageSquare },
  email: { label: "Email", Icon: Mail },
};

function MessagesPage() {
  const analyticsFn = useServerFn(getOmnichannelAnalytics);
  const analytics = useQuery({ queryKey: ["msg.analytics"], queryFn: () => analyticsFn() });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messages"
        description="Guest conversations across web concierge, WhatsApp and email."
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Web (30d)" value={analytics.data?.sessions_30d.web} />
        <StatTile label="WhatsApp (30d)" value={analytics.data?.sessions_30d.whatsapp} />
        <StatTile label="Email (30d)" value={analytics.data?.sessions_30d.email} />
        <StatTile label="Open escalations" value={analytics.data?.escalations_open} tone="danger" />
        <StatTile label="Pending drafts" value={analytics.data?.drafts_pending} />
      </div>

      <Tabs defaultValue="conversations" className="space-y-3">
        <TabsList>
          <TabsTrigger value="conversations">Conversations</TabsTrigger>
          <TabsTrigger value="escalations">Escalations</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations"><ConversationsPanel /></TabsContent>
        <TabsContent value="escalations"><EscalationsPanel /></TabsContent>
        <TabsContent value="drafts"><DraftsPanel /></TabsContent>
        <TabsContent value="channels"><ChannelsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatTile({ label, value, tone }: { label: string; value: number | undefined; tone?: "danger" }) {
  return (
    <div className="os-card p-3">
      <div className="text-[10px] uppercase tracking-widest text-[color:var(--os-ink-3)]">{label}</div>
      <div
        className={`mt-1 font-display text-2xl ${
          tone === "danger" && (value ?? 0) > 0 ? "text-[color:var(--os-danger)]" : "text-[color:var(--os-ink)]"
        }`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

// ── Conversations ──────────────────────────────────────────────────────────
function ConversationsPanel() {
  const [channel, setChannel] = useState<ConciergeChannel | "all">("all");
  const fn = useServerFn(listConciergeConversations);
  const q = useQuery({
    queryKey: ["msg.conversations", channel],
    queryFn: () => fn({ data: { channel, limit: 100 } }),
  });

  return (
    <SectionCard
      title="Guest conversations"
      actions={
        <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All channels</SelectItem>
            <SelectItem value="web">Web</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="email">Email</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {q.isLoading ? (
        <LoadingState label="Loading conversations" />
      ) : !q.data?.length ? (
        <EmptyState title="No conversations yet" description="Guests haven't reached out in this channel." />
      ) : (
        <div className="max-h-[560px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead>Guest</TableHead>
                <TableHead>Messages</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.map((row: any) => {
                const meta = CHANNEL_META[row.channel as ConciergeChannel] ?? CHANNEL_META.web;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <meta.Icon className="size-3.5" aria-hidden /> {meta.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{row.guest_name ?? "Anonymous"}</div>
                      <div className="text-xs text-[color:var(--os-ink-3)]">{row.guest_email ?? "—"}</div>
                    </TableCell>
                    <TableCell>{row.message_count ?? 0}</TableCell>
                    <TableCell className="text-xs text-[color:var(--os-ink-3)]">
                      {row.last_active_at ? formatDistanceToNow(new Date(row.last_active_at), { addSuffix: true }) : "—"}
                    </TableCell>
                    <TableCell>
                      {row.escalated ? (
                        <Badge variant="destructive">Escalated</Badge>
                      ) : (
                        <Badge variant="secondary">Active</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

// ── Escalations ───────────────────────────────────────────────────────────
function EscalationsPanel() {
  const [status, setStatus] = useState<EscalationStatus | "all">("open");
  const listFn = useServerFn(listEscalations);
  const updateFn = useServerFn(updateEscalation);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["msg.escalations", status],
    queryFn: () => listFn({ data: { status } }),
  });
  const resolveMut = useAdminMutation({
    mutationFn: (vars: { id: string; status: EscalationStatus }) =>
      updateFn({ data: { id: vars.id, status: vars.status } }),
    loadingMessage: "Updating escalation…",
    successMessage: "Escalation updated",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["msg.escalations"] }),
  });

  return (
    <SectionCard
      title="Escalations"
      actions={
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      {q.isLoading ? (
        <LoadingState label="Loading escalations" />
      ) : !q.data?.length ? (
        <EmptyState
          title="Nothing to escalate"
          description="AI has handled every conversation in this filter."
          icon={AlertTriangle}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Priority</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Badge variant={row.priority === 1 ? "destructive" : row.priority === 2 ? "default" : "secondary"}>
                    P{row.priority}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{CHANNEL_META[row.channel]?.label ?? row.channel}</TableCell>
                <TableCell className="text-xs">{row.reason.replace(/_/g, " ")}</TableCell>
                <TableCell className="max-w-[380px] truncate text-xs text-[color:var(--os-ink-2)]">
                  {row.summary ?? "—"}
                </TableCell>
                <TableCell className="text-xs text-[color:var(--os-ink-3)]">
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </TableCell>
                <TableCell className="text-right">
                  {row.status === "resolved" || row.status === "dismissed" ? (
                    <Badge variant="outline">{row.status}</Badge>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={resolveMut.isPending}
                        onClick={() => resolveMut.mutate({ id: row.id, status: "resolved" })}
                      >
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={resolveMut.isPending}
                        onClick={() => resolveMut.mutate({ id: row.id, status: "dismissed" })}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

// ── Drafts ────────────────────────────────────────────────────────────────
function DraftsPanel() {
  const fn = useServerFn(listCommunicationDrafts);
  const q = useQuery({
    queryKey: ["msg.drafts"],
    queryFn: () => fn({ data: { status: "pending" } }),
  });
  return (
    <SectionCard title="Pending communication drafts">
      {q.isLoading ? (
        <LoadingState label="Loading drafts" />
      ) : !q.data?.length ? (
        <EmptyState title="No drafts pending" description="AI-generated messages awaiting approval will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="text-xs">{row.draft_type.replace(/_/g, " ")}</TableCell>
                <TableCell className="text-xs">{CHANNEL_META[row.channel]?.label ?? row.channel}</TableCell>
                <TableCell className="max-w-[420px] truncate text-xs">{row.subject ?? row.body.slice(0, 80)}</TableCell>
                <TableCell className="text-xs text-[color:var(--os-ink-3)]">
                  {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}

// ── Channels ──────────────────────────────────────────────────────────────
function ChannelsPanel() {
  const fn = useServerFn(listConciergeChannels);
  const q = useQuery({ queryKey: ["msg.channels"], queryFn: () => fn() });
  return (
    <SectionCard title="Channel configuration">
      {q.isLoading ? (
        <LoadingState label="Loading channels" />
      ) : !q.data?.length ? (
        <EmptyState title="No channels configured" description="Configure inbound/outbound messaging channels here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {q.data.map((c) => {
            const meta = CHANNEL_META[c.channel] ?? CHANNEL_META.web;
            return (
              <div key={c.id} className="rounded-md border border-[color:var(--os-hairline)] bg-[color:var(--os-surface-2)] p-3">
                <div className="flex items-center gap-2">
                  <meta.Icon className="size-4 text-[color:var(--os-ink-2)]" aria-hidden />
                  <div className="text-sm text-[color:var(--os-ink)]">{c.display_name}</div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
                  {c.inbound_enabled && <Badge variant="outline">Inbound</Badge>}
                  {c.outbound_enabled && <Badge variant="outline">Outbound</Badge>}
                  {c.requires_approval && <Badge variant="secondary">Approval required</Badge>}
                </div>
                {c.notes && <div className="mt-2 text-xs text-[color:var(--os-ink-3)]">{c.notes}</div>}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
