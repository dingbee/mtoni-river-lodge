import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Mail, Globe, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listPropertyChannelSettings, updatePropertyChannelSettings } from "@/domains/ai/concierge/property-channel-settings.functions";

export const Route = createFileRoute("/_authenticated/admin/settings/channels")({
  head: () => ({ meta: [{ title: "Messaging Channels — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PropertyChannelsPage,
});

const definitions = [
  { channel: "web" as const, label: "Website", Icon: Globe, description: "Website concierge and guest message intake." },
  { channel: "whatsapp" as const, label: "WhatsApp", Icon: MessageSquare, description: "Meta WhatsApp channel, routed through founder-managed provider connection." },
  { channel: "email" as const, label: "Email", Icon: Mail, description: "Property guest email communications through the founder-managed Resend connection." },
];

function PropertyChannelsPage() {
  const listFn = useServerFn(listPropertyChannelSettings);
  const updateFn = useServerFn(updatePropertyChannelSettings);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["property.channel-settings"], queryFn: () => listFn() });
  const save = useMutation({
    mutationFn: (input: Parameters<typeof updateFn>[0]["data"]) => updateFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["property.channel-settings"] }),
  });
  const rows = query.data ?? [];
  return <div className="space-y-6">
    <PageHeader title="Messaging Channels" description="Property-level operating controls. Provider accounts and credentials remain governed by Nolmark CDMA." />
    <SectionCard title="Property channel controls">
      <div className="space-y-4">
        {definitions.map(({ channel, label, Icon, description }) => {
          const row = rows.find((item: any) => item.channel === channel);
          const enabled = Boolean(row?.enabled);
          return <div key={channel} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-md bg-muted"><Icon className="size-4" /></span>
                <div><div className="font-medium text-sm">{label}</div><div className="text-xs text-muted-foreground">{description}</div></div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Enabled" : "Disabled"}</Badge>
                <Button size="sm" variant="outline" disabled={save.isPending || query.isLoading}
                  onClick={() => save.mutate({ channel, enabled: !enabled })}>{enabled ? "Disable" : "Enable"}</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={row?.inbound_enabled ? "default" : "outline"} disabled={!enabled || save.isPending}
                onClick={() => save.mutate({ channel, inbound_enabled: !row?.inbound_enabled })}>Inbound {row?.inbound_enabled ? "On" : "Off"}</Button>
              <Button size="sm" variant={row?.outbound_enabled ? "default" : "outline"} disabled={!enabled || save.isPending}
                onClick={() => save.mutate({ channel, outbound_enabled: !row?.outbound_enabled })}>Outbound {row?.outbound_enabled ? "On" : "Off"}</Button>
              <Button size="sm" variant="outline" disabled={save.isPending}
                onClick={() => save.mutate({ channel, require_human_approval: row?.require_human_approval === false })}>
                Human approval {row?.require_human_approval === false ? "Not required" : "Required"}
              </Button>
              <Button size="sm" variant="outline" disabled={save.isPending}
                onClick={() => save.mutate({ channel, marketing_consent_required: row?.marketing_consent_required === false })}>
                Marketing consent {row?.marketing_consent_required === false ? "Optional" : "Required"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Sender identities, approved templates and operational preferences are property-scoped. Secrets and provider connection mappings are not editable here.</p>
          </div>;
        })}
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading property settings…</p>}
        {query.isError && <p className="text-sm text-destructive">Unable to load channel settings. Confirm tenant administrator access and that the SN-IQ-04.4 migration has been applied in the approved environment.</p>}
        {save.isError && <p className="text-sm text-destructive">Settings could not be saved. {String(save.error)}</p>}
      </div>
    </SectionCard>
    <SectionCard title="Configuration boundary">
      <div className="flex items-start gap-3 text-sm"><ShieldCheck className="mt-0.5 size-4 shrink-0" /><p>Tenant Admin controls the property’s operational channel behavior. Founder Admin controls provider credentials, webhook secrets, Meta phone-number/account routing and Resend account routing. Neither layer can change the other’s scope.</p></div>
    </SectionCard>
  </div>;
}
