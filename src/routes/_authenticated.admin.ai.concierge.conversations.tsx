import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  listConciergeConversations,
  getOmnichannelAnalytics,
} from "@/domains/ai/concierge/omnichannel.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/conversations")({
  head: () => ({
    meta: [
      { title: "Unified Conversations — Mtoni AI" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ConversationsPage,
});

type ChannelFilter = "all" | "web" | "whatsapp" | "email";

function ConversationsPage() {
  const listFn = useServerFn(listConciergeConversations);
  const statsFn = useServerFn(getOmnichannelAnalytics);
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [escalatedOnly, setEscalatedOnly] = useState(false);

  const stats = useQuery({ queryKey: ["oc.stats"], queryFn: () => statsFn() });
  const list = useQuery({
    queryKey: ["oc.conversations", channel, escalatedOnly],
    queryFn: () =>
      listFn({ data: { channel, escalated: escalatedOnly || undefined } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unified Conversations"
        description="Every guest conversation across website, WhatsApp and email, ranked by recency."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Web (30d)" value={stats.data?.sessions_30d.web ?? "—"} />
        <StatCard label="WhatsApp (30d)" value={stats.data?.sessions_30d.whatsapp ?? "—"} />
        <StatCard label="Email (30d)" value={stats.data?.sessions_30d.email ?? "—"} />
        <StatCard label="Open escalations" value={stats.data?.escalations_open ?? "—"} />
        <StatCard label="Drafts pending" value={stats.data?.drafts_pending ?? "—"} />
      </div>

      <SectionCard
        title="Conversations"
        actions={
          <div className="flex gap-2 text-sm">
            {(["all", "web", "whatsapp", "email"] as ChannelFilter[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`rounded px-2 py-1 ${channel === c ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {c}
              </button>
            ))}
            <label className="ml-2 inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={escalatedOnly}
                onChange={(e) => setEscalatedOnly(e.target.checked)}
              />
              Escalated
            </label>
          </div>
        }
      >
        <div className="divide-y">
          {list.isLoading && <p className="p-3 text-sm text-muted-foreground">Loading…</p>}
          {list.data?.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">No conversations yet.</p>
          )}
          {list.data?.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {s.guest_name || s.guest_email || s.session_token}
                </p>
                <p className="text-xs text-muted-foreground">
                  {s.message_count} msgs ·{" "}
                  {formatDistanceToNow(new Date(s.last_active_at), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{s.channel}</Badge>
                {s.escalated && <Badge variant="destructive">Escalated</Badge>}
                {typeof s.identity_confidence === "number" && s.identity_confidence > 0 && (
                  <span className="text-xs text-muted-foreground">
                    id conf {Math.round(s.identity_confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}