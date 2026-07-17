import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listConciergeChannels,
  updateConciergeChannel,
} from "@/domains/ai/concierge/omnichannel.functions";
import type { ChannelRow } from "@/domains/ai/concierge/omnichannel.types";

export const Route = createFileRoute("/_authenticated/admin/ai/concierge/channels")({
  head: () => ({
    meta: [
      { title: "Channels — Mtoni AI" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ChannelsPage,
});

function ChannelsPage() {
  const listFn = useServerFn(listConciergeChannels);
  const updateFn = useServerFn(updateConciergeChannel);
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["oc.channels"], queryFn: () => listFn() });
  const toggle = useMutation({
    mutationFn: async (v: Parameters<typeof updateFn>[0]["data"]) =>
      updateFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["oc.channels"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Channels"
        description="Register and toggle the channels Mtoni AI can listen and respond on. Configuration and secrets stay in workspace settings."
      />
      <SectionCard title="Channels">
        <div className="space-y-3">
          {list.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {list.data?.map((c: ChannelRow) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{c.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {c.channel} · {c.provider ?? "—"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={c.status === "active" ? "default" : "secondary"}
                >
                  {c.status}
                </Badge>
                <Badge variant={c.inbound_enabled ? "default" : "outline"}>
                  in {c.inbound_enabled ? "on" : "off"}
                </Badge>
                <Badge variant={c.outbound_enabled ? "default" : "outline"}>
                  out {c.outbound_enabled ? "on" : "off"}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toggle.mutate({
                      id: c.id,
                      inbound_enabled: !c.inbound_enabled,
                    })
                  }
                >
                  Toggle inbound
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toggle.mutate({
                      id: c.id,
                      outbound_enabled: !c.outbound_enabled,
                    })
                  }
                >
                  Toggle outbound
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    toggle.mutate({
                      id: c.id,
                      status: c.status === "active" ? "inactive" : "active",
                    })
                  }
                >
                  {c.status === "active" ? "Deactivate" : "Activate"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}