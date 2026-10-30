import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { listUnifiedInboxConversations, getUnifiedInboxTimeline } from "@/domains/ai/concierge/unified-inbox.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/conversations")({
  head: () => ({ meta: [{ title: "Unified Inbox — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: UnifiedInboxPage,
});

type Filter = "all" | "web" | "whatsapp" | "email";

function UnifiedInboxPage() {
  const listFn = useServerFn(listUnifiedInboxConversations);
  const timelineFn = useServerFn(getUnifiedInboxTimeline);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState("");
  const list = useQuery({ queryKey: ["staynas.unified-inbox"], queryFn: () => listFn(), refetchInterval: 30000 });
  const rows = (list.data ?? []).filter((row: any) => filter === "all" || row.channel === filter);
  const selected = rows.find((row: any) => row.id === selectedId) ?? rows[0];
  const timeline = useQuery({
    queryKey: ["staynas.unified-inbox.timeline", selected?.id],
    queryFn: () => timelineFn({ data: { session_id: selected.id } }),
    enabled: Boolean(selected?.id),
    refetchInterval: 15000,
  });

  return <div className="space-y-6">
    <PageHeader title="Unified Inbox" description="Property-scoped guest conversations across website, WhatsApp and email. Select a thread to review its complete message history." />
    <div className="flex flex-wrap gap-2">
      {(["all", "web", "whatsapp", "email"] as Filter[]).map((value) =>
        <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>{value === "all" ? "All channels" : value}</Button>
      )}
      <div className="ml-auto text-xs text-muted-foreground self-center">{rows.length} conversations · refreshes automatically</div>
    </div>
    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.6fr)]">
      <SectionCard title="Conversations">
        <div className="max-h-[72vh] overflow-y-auto divide-y">
          {list.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading inbox…</p>}
          {list.isError && <p className="p-3 text-sm text-destructive">Unable to load the property inbox. Confirm the omnichannel ledger migration is applied in the approved environment.</p>}
          {!list.isLoading && rows.length === 0 && <p className="p-3 text-sm text-muted-foreground">No conversations in this channel.</p>}
          {rows.map((row: any) => <button key={row.id} type="button" onClick={() => setSelectedId(row.id)}
            className={`w-full text-left p-3 hover:bg-muted/60 ${selected?.id === row.id ? "bg-muted" : ""}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{row.guest_name || row.guest_email || row.guest_phone || `Conversation ${row.id.slice(0, 8)}`}</span>
              <Badge variant="secondary">{row.channel}</Badge>
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">{row.latest_message?.body || row.latest_message?.subject || "No message preview available"}</p>
            <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>{row.message_count ?? 0} messages {row.escalated ? "· Escalated" : ""}</span>
              <span>{row.last_active_at ? formatDistanceToNow(new Date(row.last_active_at), { addSuffix: true }) : "—"}</span>
            </div>
          </button>)}
        </div>
      </SectionCard>
      <SectionCard title={selected ? (selected.guest_name || selected.guest_email || selected.guest_phone || "Conversation") : "Message timeline"}
        actions={selected ? <div className="flex items-center gap-2"><Badge variant="secondary">{selected.channel}</Badge>{selected.escalated && <Badge variant="destructive">Escalated</Badge>}</div> : null}>
        {!selected && <p className="text-sm text-muted-foreground">Select a conversation to inspect its history.</p>}
        {selected && <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {selected.guest_email && <span>{selected.guest_email}</span>}
            {selected.guest_phone && <span>{selected.guest_phone}</span>}
            <span>{selected.message_count ?? 0} messages</span>
          </div>
          {timeline.isLoading && <p className="text-sm text-muted-foreground">Loading message history…</p>}
          {timeline.isError && <p className="text-sm text-destructive">Could not load this conversation timeline.</p>}
          <div className="max-h-[62vh] space-y-3 overflow-y-auto rounded-lg border bg-muted/20 p-3">
            {(timeline.data?.legacyMessages ?? []).map((message: any) => <div key={`legacy-${message.id}`} className={`max-w-[88%] rounded-lg border bg-background p-3 ${message.role === "user" ? "mr-auto" : "ml-auto"}`}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">Website legacy</Badge><span>{message.role}</span></div>
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
              <p className="mt-2 text-right text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}</p>
            </div>)}
            {(timeline.data?.messages ?? []).map((message: any) => <div key={message.id} className={`max-w-[88%] rounded-lg border bg-background p-3 ${message.direction === "outbound" ? "ml-auto" : "mr-auto"}`}>
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{message.channel}</Badge><span>{message.direction} · {message.actor_type}</span>
                <Badge variant={message.status === "failed" || message.status === "undeliverable" ? "destructive" : "secondary"}>{message.status}</Badge>
              </div>
              {message.subject && <p className="mb-1 text-sm font-medium">{message.subject}</p>}
              <p className="whitespace-pre-wrap text-sm">{message.body || (message.message_type === "media" ? "Media message received" : "Event")}</p>
              <p className="mt-2 text-right text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(message.occurred_at), { addSuffix: true })}</p>
            </div>)}
            {timeline.data && timeline.data.messages.length === 0 && timeline.data.legacyMessages.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No messages recorded in this conversation.</p>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <p className="text-xs text-muted-foreground">Assignment and human approval remain property-scoped and are handled by the existing escalation and draft controls.</p>
            <div className="flex flex-wrap gap-2">
              <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted" href="/admin/ai/concierge/escalations">Staff assignment</a>
              <a className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted" href="/admin/ai/concierge/drafts">Draft approval</a>
            </div>
          </div>
        </div>}
      </SectionCard>
    </div>
  </div>;
}
