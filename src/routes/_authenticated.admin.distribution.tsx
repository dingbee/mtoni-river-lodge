import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Cable, Clock3, Inbox, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";
import { getDistributionCentre } from "@/domains/distribution/distribution-centre.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/distribution")({
  head: () => ({ meta: [{ title: "Distribution Centre — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: DistributionCentre,
});

function DistributionCentre() {
  const load = useServerFn(getDistributionCentre);
  const query = useQuery({
    queryKey: ["distribution-centre"],
    queryFn: () => load(),
    staleTime: 20_000,
    refetchInterval: 60_000,
  });
  const data = query.data;

  if (query.isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading Distribution Centre…</div>;
  if (query.error) return <div className="rounded-lg border border-destructive/30 p-5 text-sm text-destructive">{query.error.message}</div>;

  const connections = data?.connections ?? [];
  const mappings = data?.mappings ?? [];
  const operations = data?.operations ?? [];
  const inbox = data?.inbox ?? [];
  const pending = operations.filter((item: any) => ["queued", "processing", "retry_wait"].includes(item.status)).length;
  const exceptions = operations.filter((item: any) => ["failed", "dead_letter"].includes(item.status)).length
    + inbox.filter((item: any) => ["manual_review", "failed", "dead_letter"].includes(item.processing_status)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Distribution Centre"
        description="Property-scoped channel connections, exact mappings, publication operations and reservation events."
        actions={<Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}><RefreshCw className="mr-2 size-4" />Refresh</Button>}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
        <div>
          <div className="text-sm font-semibold">{data?.property.name ?? "Active property"}</div>
          <div className="text-xs text-muted-foreground">{data?.property.currency} · {data?.property.timezone}</div>
        </div>
        <Badge variant="outline">Physical configuration pending</Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Cable} label="Connections" value={connections.length} detail="Configured provider accounts" />
        <Metric icon={RadioTower} label="Mappings" value={mappings.length} detail="Exact room and rate mappings" />
        <Metric icon={Clock3} label="Queued / active" value={pending} detail="Operations awaiting dispatch" />
        <Metric icon={AlertTriangle} label="Exceptions" value={exceptions} detail="Failed events and manual review" />
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="size-4" />Runtime safety gates</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <Gate label="Provider adapters" value="None registered" />
          <Gate label="Outbound dispatch" value="Disabled" />
          <Gate label="Inbound canonical writer" value="Disabled pending SPE-06 acceptance" />
          <Gate label="Credential vault" value="Deferred for physical configuration" />
        </CardContent>
      </Card>

      <SectionCard title="Provider connections" description="Credential references are never returned to the browser.">
        {connections.length === 0 ? <Empty>No provider connections have been configured for this property.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>Provider</TableHead><TableHead>External account / property</TableHead><TableHead>Status</TableHead><TableHead>Mappings version</TableHead><TableHead>Last validation</TableHead></TableRow></TableHeader>
            <TableBody>{connections.map((item: any) => <TableRow key={item.id}>
              <TableCell className="font-medium">{item.provider}</TableCell>
              <TableCell>{item.external_account_id} / {item.external_property_id}</TableCell>
              <TableCell><Badge variant={item.status === "active" ? "default" : "outline"}>{item.status}</Badge></TableCell>
              <TableCell>{item.mapping_version}</TableCell>
              <TableCell>{formatDate(item.last_validated_at)}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Exact mappings" description="Mappings are explicit provider IDs; no fuzzy name matching is used.">
        {mappings.length === 0 ? <Empty>No room-type or rate-plan mappings configured.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>Type</TableHead><TableHead>Internal ID</TableHead><TableHead>External ID</TableHead><TableHead>Version</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{mappings.map((item: any) => <TableRow key={item.id}>
              <TableCell>{item.mapping_type}</TableCell><TableCell className="font-mono text-xs">{item.internal_id}</TableCell>
              <TableCell className="font-mono text-xs">{item.external_id}</TableCell><TableCell>{item.version}</TableCell>
              <TableCell><Badge variant={item.active ? "default" : "outline"}>{item.active ? "Active" : "Inactive"}</Badge></TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Outbound operation ledger" description="Latest 50 operations for the active property.">
        {operations.length === 0 ? <Empty>No distribution operations recorded.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>Operation</TableHead><TableHead>Status</TableHead><TableHead>Attempts</TableHead><TableHead>Created</TableHead><TableHead>Diagnostic</TableHead></TableRow></TableHeader>
            <TableBody>{operations.map((item: any) => <TableRow key={item.id}>
              <TableCell>{item.operation_type}</TableCell><TableCell><Badge variant={["failed", "dead_letter"].includes(item.status) ? "destructive" : "outline"}>{item.status}</Badge></TableCell>
              <TableCell>{item.attempt_count}</TableCell><TableCell>{formatDate(item.created_at)}</TableCell>
              <TableCell className="max-w-xs truncate text-xs text-muted-foreground">{item.error_code ?? item.safe_error_message ?? "—"}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Inbound reservation inbox" description="Provider events are visible for review; no live ingestion is enabled.">
        {inbox.length === 0 ? <Empty>No inbound reservation events received.</Empty> : (
          <Table>
            <TableHeader><TableRow><TableHead>External reservation</TableHead><TableHead>Event</TableHead><TableHead>Status</TableHead><TableHead>Received</TableHead><TableHead>Diagnostic</TableHead></TableRow></TableHeader>
            <TableBody>{inbox.map((item: any) => <TableRow key={item.id}>
              <TableCell className="font-mono text-xs">{item.external_reservation_id}</TableCell><TableCell>{item.event_type}</TableCell>
              <TableCell><Badge variant={["manual_review", "failed", "dead_letter"].includes(item.processing_status) ? "destructive" : "outline"}>{item.processing_status}</Badge></TableCell>
              <TableCell>{formatDate(item.received_at)}</TableCell><TableCell className="max-w-xs truncate text-xs text-muted-foreground">{item.safe_error_code ?? item.safe_error_message ?? "—"}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        )}
      </SectionCard>
      <p className="text-xs text-muted-foreground">Refreshes every 60 seconds. This workspace is read-only in this milestone; provider setup and activation remain gated.</p>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: number; detail: string }) {
  return <Card><CardContent className="flex items-center gap-3 p-4"><div className="rounded-md bg-muted p-2"><Icon className="size-4" /></div><div><div className="text-2xl font-semibold tabular-nums">{value}</div><div className="text-sm font-medium">{label}</div><div className="text-xs text-muted-foreground">{detail}</div></div></CardContent></Card>;
}
function Gate({ label, value }: { label: string; value: string }) { return <div className="flex items-start gap-2 rounded-md border p-3"><ShieldAlert className="mt-0.5 size-4 text-muted-foreground" /><div><div className="font-medium">{label}</div><div className="text-muted-foreground">{value}</div></div></div>; }
function Empty({ children }: { children: React.ReactNode }) { return <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Inbox className="size-4" />{children}</div>; }
function formatDate(value: string | null) { return value ? new Date(value).toLocaleString() : "—"; }
