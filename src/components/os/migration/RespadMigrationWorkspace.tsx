import { useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  importRespadBatch,
  listRespadAuditLog,
  listRespadBatches,
  listRespadDuplicates,
  listRespadNormalizedAccounts,
  listRespadRawRecords,
  listRespadRelationships,
  getRespadQualityReport,
} from "@/domains/migration/respad/respad.functions";
import { MTONI_FIELD_MAP, MTONI_SCHEMA_GAPS, MTONI_TARGET_TABLE } from "@/domains/migration/respad/normalize";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { RespadReconciliation } from "./RespadReconciliation";
import { ShieldAlert, Upload } from "lucide-react";

type AnyRow = Record<string, any>;

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[color:var(--os-hairline,var(--border))] bg-card p-4">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Chips({ values }: { values?: string[] | null }) {
  if (!values?.length) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((v) => (
        <Badge key={v} variant="outline" className="font-normal">
          {v}
        </Badge>
      ))}
    </span>
  );
}

const CONF_VARIANT: Record<string, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

export function RespadMigrationWorkspace() {
  const qc = useQueryClient();
  const batchesFn = useServerFn(listRespadBatches);
  const importFn = useServerFn(importRespadBatch);

  const batches = useQuery({ queryKey: ["respad", "batches"], queryFn: () => batchesFn() });
  const [selected, setSelected] = useState<string | null>(null);
  const batchId = selected ?? (batches.data as AnyRow[] | undefined)?.[0]?.id ?? null;
  const batch = ((batches.data as AnyRow[]) ?? []).find((b) => b.id === batchId);

  const fileRef = useRef<HTMLInputElement>(null);
  const [batchName, setBatchName] = useState("ResPad accounts — phase 1");

  const runImport = useMutation({
    mutationFn: async (files: FileList) => {
      const payload: { source_file: string; records: AnyRow[] }[] = [];
      for (const f of Array.from(files)) {
        const text = await f.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`${f.name} is not valid JSON`);
        }
        const records = Array.isArray(parsed)
          ? parsed
          : Array.isArray((parsed as AnyRow)?.data)
            ? (parsed as AnyRow).data
            : Array.isArray((parsed as AnyRow)?.records)
              ? (parsed as AnyRow).records
              : [parsed];
        payload.push({ source_file: f.name, records: records as AnyRow[] });
      }
      return importFn({ data: { batch_name: batchName, files: payload, notes: null } });
    },
    onSuccess: (res: AnyRow) => {
      toast.success(
        `Staged ${res.staged_record_count} records → ${res.normalized_account_count} account candidates`,
      );
      setSelected(res.batch_id);
      qc.invalidateQueries({ queryKey: ["respad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Alert>
        <ShieldAlert className="size-4" />
        <AlertTitle>Staging, audit and mapping only</AlertTitle>
        <AlertDescription>
          Nothing on this screen writes to guests, bookings, the calendar, rooms, inventory or pricing.
          Imports are idempotent — re-running the same files updates staging in place rather than
          duplicating it. No production accounts are created and no duplicates are merged.
        </AlertDescription>
      </Alert>

      <SectionCard title="Import source files" description="Select RACK_RATES.json, STO.json and STO_-_LOW.json.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="text-xs text-muted-foreground">Batch name</label>
            <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) runImport.mutate(e.target.files);
              e.target.value = "";
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={runImport.isPending}>
            <Upload className="mr-2 size-4" />
            {runImport.isPending ? "Staging…" : "Choose JSON files"}
          </Button>
          {((batches.data as AnyRow[]) ?? []).length > 1 && (
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={batchId ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {((batches.data as AnyRow[]) ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_name}
                </option>
              ))}
            </select>
          )}
        </div>
      </SectionCard>

      {!batchId ? (
        <EmptyState
          title="No migration batch staged yet"
          description="Upload the three ResPad JSON files to build the staging and audit layer."
        />
      ) : (
        <BatchWorkspace batchId={batchId} batch={batch} />
      )}
    </div>
  );
}

function BatchWorkspace({ batchId, batch }: { batchId: string; batch?: AnyRow }) {
  const reportFn = useServerFn(getRespadQualityReport);
  const report = useQuery({
    queryKey: ["respad", "report", batchId],
    queryFn: () => reportFn({ data: { batch_id: batchId } }),
  });
  const r = report.data as AnyRow | undefined;

  return (
    <Tabs defaultValue="overview" className="space-y-4">
      <TabsList className="flex w-full flex-wrap justify-start">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="files">Source files</TabsTrigger>
        <TabsTrigger value="raw">Raw records</TabsTrigger>
        <TabsTrigger value="accounts">Normalized accounts</TabsTrigger>
        <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
        <TabsTrigger value="duplicates">Duplicates</TabsTrigger>
        <TabsTrigger value="groups">Commercial groups</TabsTrigger>
        <TabsTrigger value="quality">Data quality</TabsTrigger>
        <TabsTrigger value="mapping">Mapping preview</TabsTrigger>
        <TabsTrigger value="audit">Audit log</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Raw records" value={r?.totals?.raw_records ?? "—"} hint="original ResPad rows preserved" />
          <Stat label="Normalized accounts" value={r?.totals?.normalized_accounts ?? "—"} hint="unique candidates" />
          <Stat
            label="Commercial relationships"
            value={r?.totals?.commercial_relationships ?? "—"}
            hint="account ↔ ResPad group"
          />
          <Stat label="Duplicate groups" value={r?.totals?.duplicate_groups ?? "—"} hint="nothing merged" />
          <Stat label="High confidence" value={r?.totals?.high_confidence ?? "—"} />
          <Stat label="Medium confidence" value={r?.totals?.medium_confidence ?? "—"} />
          <Stat label="Low confidence" value={r?.totals?.low_confidence ?? "—"} />
          <Stat label="Needs manual review" value={r?.totals?.manual_review ?? "—"} />
        </div>
        {batch && (
          <SectionCard title="Batch" description={`Status: ${batch.status} · errors: ${batch.error_count}`}>
            <div className="text-sm text-muted-foreground">
              <p>Source system: {batch.source_system}</p>
              <p>Files: {(batch.source_files ?? []).join(", ") || "—"}</p>
              <p>Imported: {batch.imported_at ? new Date(batch.imported_at).toLocaleString() : "—"}</p>
            </div>
          </SectionCard>
        )}
      </TabsContent>

      <TabsContent value="files">
        <SectionCard title="Records per source file">
          <SimpleTable
            head={["Source file", "Records"]}
            rows={(r?.per_file ?? []).map((f: AnyRow) => [f.source_file, String(f.records)])}
          />
        </SectionCard>
      </TabsContent>

      <TabsContent value="raw">
        <RawRecords batchId={batchId} />
      </TabsContent>

      <TabsContent value="accounts">
        <NormalizedAccounts batchId={batchId} />
      </TabsContent>

      <TabsContent value="reconciliation">
        <RespadReconciliation batchId={batchId} />
      </TabsContent>

      <TabsContent value="duplicates">
        <Duplicates batchId={batchId} />
      </TabsContent>

      <TabsContent value="groups" className="space-y-4">
        <SectionCard title="Records per ResPad group">
          <SimpleTable
            head={["Group", "Records"]}
            rows={(r?.per_group ?? []).map((g: AnyRow) => [g.groupname, String(g.records)])}
          />
        </SectionCard>
        <Relationships batchId={batchId} />
      </TabsContent>

      <TabsContent value="quality" className="space-y-4">
        <SectionCard title="Record-level issues">
          <SimpleTable
            head={["Issue", "Records"]}
            rows={(r?.issues ?? []).map((i: AnyRow) => [i.label, String(i.records)])}
          />
        </SectionCard>
        <SectionCard title="Account-level issues">
          <SimpleTable
            head={["Issue", "Accounts"]}
            rows={(r?.account_issues ?? []).map((i: AnyRow) => [i.label, String(i.accounts)])}
          />
        </SectionCard>
      </TabsContent>

      <TabsContent value="mapping" className="space-y-4">
        <SectionCard
          title="Mtoni OS mapping preview (read-only)"
          description={`Target: ${MTONI_TARGET_TABLE}`}
        >
          <SimpleTable
            head={["ResPad field", "Mtoni target", "Note"]}
            rows={MTONI_FIELD_MAP.map((m) => [m.source, m.target, m.note])}
          />
        </SectionCard>
        <SectionCard title="Schema gaps discovered">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {MTONI_SCHEMA_GAPS.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </SectionCard>
        <MappingPreview batchId={batchId} />
      </TabsContent>

      <TabsContent value="audit">
        <AuditLog batchId={batchId} />
      </TabsContent>
    </Tabs>
  );
}

function SimpleTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              {row.map((c, j) => (
                <td key={j} className="py-2 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RawRecords({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadRawRecords);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["respad", "raw", batchId, search, page],
    queryFn: () => fn({ data: { batch_id: batchId, search: search || undefined, limit: 100, offset: page * 100 } }),
  });
  const d = q.data as AnyRow | undefined;
  return (
    <SectionCard title="Raw ResPad records" description={`${d?.total ?? 0} staged rows — originals preserved verbatim.`}>
      <Input
        placeholder="Search client name…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="mb-3 max-w-sm"
      />
      <SimpleTable
        head={["File", "Group", "Legacy client name", "Normalized", "Email", "Phone", "TIN", "Status", "Flags"]}
        rows={(d?.rows ?? []).map((row: AnyRow) => [
          row.source_file,
          row.legacy_groupname ?? "—",
          row.legacy_clientname ?? "—",
          row.normalized_account_name ?? "—",
          row.normalized_email ?? row.legacy_email ?? "—",
          row.normalized_phone ?? "—",
          row.normalized_tin ?? "—",
          <Badge key="s" variant={row.normalization_status === "ok" ? "outline" : "secondary"}>
            {row.normalization_status}
          </Badge>,
          <Chips key="f" values={row.quality_flags} />,
        ])}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={(page + 1) * 100 >= (d?.total ?? 0)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </Button>
      </div>
    </SectionCard>
  );
}

function NormalizedAccounts({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadNormalizedAccounts);
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["respad", "accounts", batchId, search],
    queryFn: () => fn({ data: { batch_id: batchId, search: search || undefined, limit: 500 } }),
  });
  const d = q.data as AnyRow | undefined;
  return (
    <SectionCard
      title="Normalized account candidates"
      description={`${d?.total ?? 0} unique organizations derived from the staged records. Classification is inferred by migration rule, not verified.`}
    >
      <Input
        placeholder="Search account…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-3 max-w-sm"
      />
      <SimpleTable
        head={["Account", "Type (inferred)", "ResPad groups", "Records", "Emails", "Phones", "TIN / VRN", "Flags"]}
        rows={(d?.rows ?? []).map((a: AnyRow) => [
          a.account_name,
          <span key="t" title={a.classification_evidence ?? ""}>
            <Badge variant="outline">{a.account_type}</Badge>
          </span>,
          <Chips key="g" values={a.groupnames} />,
          String(a.source_record_count),
          <Chips key="e" values={a.emails} />,
          <Chips key="p" values={a.phones} />,
          [...(a.tins ?? []), ...(a.vrns ?? [])].join(" / ") || "—",
          <Chips key="f" values={a.quality_flags} />,
        ])}
      />
    </SectionCard>
  );
}

function Duplicates({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadDuplicates);
  const q = useQuery({
    queryKey: ["respad", "dupes", batchId],
    queryFn: () => fn({ data: { batch_id: batchId } }),
  });
  const groups = useMemo(() => {
    const m = new Map<string, AnyRow[]>();
    for (const row of ((q.data as AnyRow[]) ?? [])) {
      const list = m.get(row.duplicate_group_id) ?? [];
      list.push(row);
      m.set(row.duplicate_group_id, list);
    }
    return [...m.values()].sort((a, b) => (a[0].confidence === "high" ? -1 : 1));
  }, [q.data]);

  if (!groups.length)
    return <EmptyState title="No duplicate candidates" description="No cross-account matches were detected." />;

  return (
    <div className="space-y-3">
      {groups.map((members) => {
        const first = members[0]!;
        return (
          <SectionCard
            key={first.duplicate_group_id}
            title={`${members.length} possible matches`}
            description={first.match_reason}
            actions={
              <div className="flex items-center gap-2">
                <Badge variant={CONF_VARIANT[first.confidence] ?? "secondary"}>{first.confidence} confidence</Badge>
                <Badge variant="outline">{first.proposed_action}</Badge>
              </div>
            }
          >
            <SimpleTable
              head={["Account", "Proposed master", "Groups", "Emails", "Phones", "TIN / VRN", "Records"]}
              rows={members.map((m) => {
                const a = m.respad_normalized_accounts ?? {};
                return [
                  a.account_name ?? "—",
                  m.is_proposed_master ? <Badge key="m">master</Badge> : "—",
                  <Chips key="g" values={a.groupnames} />,
                  <Chips key="e" values={a.emails} />,
                  <Chips key="p" values={a.phones} />,
                  [...(a.tins ?? []), ...(a.vrns ?? [])].join(" / ") || "—",
                  String(a.source_record_count ?? 0),
                ];
              })}
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Merging is not executed in this phase — this is a proposal for review only.
            </p>
          </SectionCard>
        );
      })}
    </div>
  );
}

function Relationships({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadRelationships);
  const q = useQuery({
    queryKey: ["respad", "rels", batchId],
    queryFn: () => fn({ data: { batch_id: batchId } }),
  });
  const rows = (q.data as AnyRow[]) ?? [];
  return (
    <SectionCard
      title="Commercial group relationships"
      description={`${rows.length} account ↔ ResPad group links. One organization may hold several group relationships.`}
    >
      <SimpleTable
        head={["Account", "ResPad group", "Source file", "Legacy company id", "Type"]}
        rows={rows.map((r) => [
          r.respad_normalized_accounts?.account_name ?? "—",
          r.legacy_groupname,
          r.source_file,
          r.legacy_company_id ?? "—",
          r.relationship_type,
        ])}
      />
    </SectionCard>
  );
}

function MappingPreview({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadNormalizedAccounts);
  const q = useQuery({
    queryKey: ["respad", "mapping", batchId],
    queryFn: () => fn({ data: { batch_id: batchId, limit: 500 } }),
  });
  const rows = ((q.data as AnyRow | undefined)?.rows ?? []) as AnyRow[];
  return (
    <SectionCard
      title="Per-account mapping preview"
      description="What each candidate would become. No production record is created and no Mtoni target id exists yet."
    >
      <SimpleTable
        head={["ResPad account", "Legacy company id(s)", "ResPad group(s)", "→ accounts.name", "→ email", "→ phone", "→ tin/vrn", "Mtoni target id"]}
        rows={rows.map((a) => [
          (a.legacy_clientnames ?? []).join(" | ") || a.account_name,
          (a.legacy_company_ids ?? []).join(", ") || "—",
          <Chips key="g" values={a.groupnames} />,
          a.account_name,
          a.emails?.[0] ?? "—",
          a.phones?.[0] ?? "—",
          [a.tins?.[0] ?? "—", a.vrns?.[0] ?? "—"].join(" / "),
          <span key="t" className="text-muted-foreground">
            not created
          </span>,
        ])}
      />
    </SectionCard>
  );
}

function AuditLog({ batchId }: { batchId: string }) {
  const fn = useServerFn(listRespadAuditLog);
  const q = useQuery({
    queryKey: ["respad", "audit", batchId],
    queryFn: () => fn({ data: { batch_id: batchId } }),
  });
  const rows = (q.data as AnyRow[]) ?? [];
  return (
    <SectionCard title="Migration audit log">
      <SimpleTable
        head={["When", "Action", "Phase", "Detail"]}
        rows={rows.map((r) => [
          new Date(r.created_at).toLocaleString(),
          r.action,
          r.phase,
          <code key="d" className="text-xs text-muted-foreground">
            {JSON.stringify(r.detail)}
          </code>,
        ])}
      />
    </SectionCard>
  );
}