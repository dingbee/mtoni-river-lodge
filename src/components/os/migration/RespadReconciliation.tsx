import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  bulkSetRespadAccountReview,
  getRespadAccountDossier,
  getRespadReadinessReport,
  listRespadDuplicateGroups,
  listRespadReviewAccounts,
  resolveRespadDuplicateGroup,
  setRespadAccountClassification,
  setRespadAccountReview,
  updateRespadCanonicalAccount,
} from "@/domains/migration/respad/respad.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { Lock, ShieldCheck } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

const ACCOUNT_TYPES = [
  "tour_operator",
  "ota",
  "booking_channel",
  "corporate",
  "organization",
  "direct",
  "other",
  "unknown",
] as const;

const REVIEW_STATUSES = ["needs_review", "pending", "approved", "rejected", "merged"] as const;

const QUALITY_FLAGS: { key: string; label: string }[] = [
  { key: "missing_vrn", label: "Missing VRN" },
  { key: "missing_website", label: "Missing website" },
  { key: "missing_tin", label: "Missing TIN" },
  { key: "missing_phone", label: "Missing phone" },
  { key: "missing_email", label: "Missing email" },
  { key: "missing_address", label: "Missing address" },
  { key: "malformed_email", label: "Malformed email" },
  { key: "malformed_phone", label: "Malformed phone" },
  { key: "multiple_emails", label: "Multiple emails" },
];

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  approved: "default",
  rejected: "destructive",
  merged: "secondary",
  needs_review: "outline",
  pending: "outline",
};

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 font-display text-2xl leading-none text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | string[] | null }) {
  const text = Array.isArray(value) ? value.join(", ") : value;
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-1 text-sm">
      <span className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="break-words text-foreground">{text || "—"}</span>
    </div>
  );
}

export function RespadReconciliation({ batchId }: { batchId: string }) {
  return (
    <div className="space-y-4">
      <Alert>
        <ShieldCheck className="size-4" />
        <AlertTitle>Phase 1B — human reconciliation only</AlertTitle>
        <AlertDescription>
          Reviewer decisions are recorded against the staging layer only. ResPad source rows stay
          immutable, merges never delete records, and no production account is created in this phase.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="readiness" className="space-y-4">
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="readiness">Readiness</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicate review</TabsTrigger>
          <TabsTrigger value="classification">Classification queue</TabsTrigger>
          <TabsTrigger value="structure">Multi-record &amp; groups</TabsTrigger>
          <TabsTrigger value="quality">Quality filters</TabsTrigger>
          <TabsTrigger value="accounts">Account review</TabsTrigger>
        </TabsList>

        <TabsContent value="readiness">
          <ReadinessDashboard batchId={batchId} />
        </TabsContent>
        <TabsContent value="duplicates">
          <DuplicateReview batchId={batchId} />
        </TabsContent>
        <TabsContent value="classification">
          <AccountQueue batchId={batchId} initialFilters={{ account_type: "unknown" }} classificationMode />
        </TabsContent>
        <TabsContent value="structure" className="space-y-4">
          <SectionCard
            title="Accounts consolidated from multiple raw records"
            description="Verify the combined information against every source row before approving."
          >
            <AccountQueue batchId={batchId} initialFilters={{ only_multi_record: true }} embedded />
          </SectionCard>
          <SectionCard
            title="Accounts appearing in more than one ResPad group"
            description="One account, multiple commercial group relationships — never split into duplicates."
          >
            <AccountQueue batchId={batchId} initialFilters={{ only_multi_group: true }} embedded />
          </SectionCard>
        </TabsContent>
        <TabsContent value="quality">
          <QualityReview batchId={batchId} />
        </TabsContent>
        <TabsContent value="accounts">
          <AccountQueue batchId={batchId} initialFilters={{}} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------- readiness */

function ReadinessDashboard({ batchId }: { batchId: string }) {
  const fn = useServerFn(getRespadReadinessReport);
  const q = useQuery({
    queryKey: ["respad", "readiness", batchId],
    queryFn: () => fn({ data: { batch_id: batchId } }),
  });
  const r = q.data as Row | undefined;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Stat label="Normalized accounts" value={r?.totals?.normalized_accounts ?? "—"} />
        <Stat label="Approved" value={r?.totals?.approved ?? "—"} />
        <Stat label="Rejected" value={r?.totals?.rejected ?? "—"} />
        <Stat label="Merged" value={r?.totals?.merged ?? "—"} />
        <Stat label="Needs review" value={r?.totals?.needs_review ?? "—"} />
        <Stat label="Pending" value={r?.totals?.pending ?? "—"} />
        <Stat
          label="Unresolved duplicate groups"
          value={r?.duplicates?.unresolved ?? "—"}
          hint={`${r?.duplicates?.high_confidence_unresolved ?? 0} high confidence`}
        />
        <Stat label="Unknown classifications" value={r?.classification?.unknown ?? "—"} />
        <Stat
          label="Multi-record / multi-group"
          value={`${r?.structure?.multi_record_accounts ?? "—"} / ${r?.structure?.multi_group_accounts ?? "—"}`}
        />
      </div>

      <SectionCard title="Classification breakdown">
        <div className="flex flex-wrap gap-2">
          {(r?.classification?.by_type ?? []).map((t: Row) => (
            <Badge key={t.type} variant="outline" className="font-normal">
              {t.type}: {t.count}
            </Badge>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Data-quality flags (review flags, not errors)">
        <div className="flex flex-wrap gap-2">
          {(r?.quality ?? []).map((f: Row) => (
            <Badge key={f.flag} variant="secondary" className="font-normal">
              {f.flag.replace(/_/g, " ")}: {f.accounts}
            </Badge>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Approval gate">
        {(r?.gate?.blockers ?? []).length ? (
          <ul className="mb-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {(r?.gate?.blockers ?? []).map((b: string) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            No outstanding blockers. Production import still remains closed until Phase 2.
          </p>
        )}
        <Button disabled title="Phase 2 — Not Yet Available">
          <Lock className="mr-2 size-4" />
          Create production accounts — Phase 2 — Not Yet Available
        </Button>
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------- duplicates */

function DuplicateReview({ batchId }: { batchId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRespadDuplicateGroups);
  const resolveFn = useServerFn(resolveRespadDuplicateGroup);
  const q = useQuery({
    queryKey: ["respad", "dupe-groups", batchId],
    queryFn: () => listFn({ data: { batch_id: batchId } }),
  });
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [canonical, setCanonical] = useState<Record<string, string>>({});

  const resolve = useMutation({
    mutationFn: (v: { group: Row; decision: "merge" | "separate" | "needs_review" }) =>
      resolveFn({
        data: {
          batch_id: batchId,
          duplicate_group_id: v.group.duplicate_group_id,
          decision: v.decision,
          canonical_account_id:
            v.decision === "merge"
              ? (canonical[v.group.duplicate_group_id] ??
                v.group.members.find((m: Row) => m.is_proposed_master)?.account?.id ??
                v.group.members[0]?.account?.id)
              : null,
          notes: notes[v.group.duplicate_group_id] || null,
        },
      }),
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["respad"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const groups = (q.data as Row[]) ?? [];
  if (!groups.length)
    return <EmptyState title="No duplicate candidates" description="Nothing to reconcile in this batch." />;

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <SectionCard
          key={g.duplicate_group_id}
          title={g.members.map((m: Row) => m.account?.account_name).join("  ↔  ")}
          description={g.match_reason}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant={g.confidence === "high" ? "destructive" : "default"}>{g.confidence}</Badge>
              <Badge variant="outline">{g.resolution_status}</Badge>
            </div>
          }
        >
          <div className="grid gap-4 lg:grid-cols-2">
            {g.members.map((m: Row) => {
              const a = m.account ?? {};
              const chosen =
                (canonical[g.duplicate_group_id] ?? (m.is_proposed_master ? a.id : "")) === a.id;
              return (
                <div
                  key={a.id}
                  className={`rounded-lg border p-4 ${chosen ? "border-primary" : "border-border"}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="font-medium">{a.account_name}</p>
                    <Button
                      size="sm"
                      variant={chosen ? "default" : "outline"}
                      onClick={() =>
                        setCanonical((s) => ({ ...s, [g.duplicate_group_id]: a.id }))
                      }
                    >
                      {chosen ? "Canonical" : "Make canonical"}
                    </Button>
                  </div>
                  <Field label="Original" value={a.legacy_clientnames} />
                  <Field label="TIN" value={a.tins} />
                  <Field label="VRN" value={a.vrns} />
                  <Field label="Email" value={a.emails} />
                  <Field label="Phone" value={a.phones} />
                  <Field label="Website" value={a.websites} />
                  <Field label="Address" value={a.addresses} />
                  <Field label="Group" value={a.groupnames} />
                  <Field label="Source" value={a.source_files} />
                  <Field label="Review" value={a.review_status} />
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <p>
              <span className="text-muted-foreground">Matching fields: </span>
              {(g.analysis?.matching ?? []).join(", ") || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Conflicting fields: </span>
              {(g.analysis?.conflicting ?? []).join(", ") || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Signals: </span>
              {(g.match_signals ?? []).join(", ") || "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Proposed action: </span>
              {g.proposed_action ?? "—"}
            </p>
          </div>

          <Textarea
            className="mt-3"
            placeholder="Reviewer notes (recorded in the audit log)"
            value={notes[g.duplicate_group_id] ?? g.resolution_notes ?? ""}
            onChange={(e) => setNotes((s) => ({ ...s, [g.duplicate_group_id]: e.target.value }))}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ group: g, decision: "merge" })}
            >
              Confirm same account / merge
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ group: g, decision: "separate" })}
            >
              Keep separate
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={resolve.isPending}
              onClick={() => resolve.mutate({ group: g, decision: "needs_review" })}
            >
              Needs further review
            </Button>
          </div>
        </SectionCard>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------- quality view */

function QualityReview({ batchId }: { batchId: string }) {
  const [flag, setFlag] = useState<string>(QUALITY_FLAGS[0].key);
  return (
    <div className="space-y-4">
      <SectionCard title="Data-quality filters" description="Review flags — never auto-corrected or fabricated.">
        <div className="flex flex-wrap gap-2">
          {QUALITY_FLAGS.map((f) => (
            <Button
              key={f.key}
              size="sm"
              variant={flag === f.key ? "default" : "outline"}
              onClick={() => setFlag(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </SectionCard>
      <AccountQueue batchId={batchId} initialFilters={{ quality_flag: flag }} key={flag} embedded />
    </div>
  );
}

/* --------------------------------------------------------- account queues */

function AccountQueue({
  batchId,
  initialFilters,
  classificationMode,
  embedded,
}: {
  batchId: string;
  initialFilters: Row;
  classificationMode?: boolean;
  embedded?: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRespadReviewAccounts);
  const reviewFn = useServerFn(setRespadAccountReview);
  const bulkFn = useServerFn(bulkSetRespadAccountReview);
  const classifyFn = useServerFn(setRespadAccountClassification);

  const [status, setStatus] = useState<string>("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(
    () => ({
      batch_id: batchId,
      ...initialFilters,
      ...(status ? { review_status: status } : {}),
      ...(search ? { search } : {}),
      limit: 100,
    }),
    [batchId, initialFilters, status, search],
  );

  const q = useQuery({
    queryKey: ["respad", "review-accounts", filters],
    queryFn: () => listFn({ data: filters }),
  });
  const data = q.data as { rows: Row[]; total: number } | undefined;
  const rows = data?.rows ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["respad"] });
  const review = useMutation({
    mutationFn: (v: { account_id: string; review_status: string }) => reviewFn({ data: v }),
    onSuccess: () => {
      toast.success("Review recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const classify = useMutation({
    mutationFn: (v: { account_id: string; account_type: string }) => classifyFn({ data: v }),
    onSuccess: () => {
      toast.success("Classification updated");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const bulk = useMutation({
    mutationFn: (review_status: string) =>
      bulkFn({
        data: { batch_id: batchId, account_ids: rows.map((r) => r.id), review_status },
      }),
    onSuccess: () => {
      toast.success("Bulk review recorded");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const body = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search account name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All review states</option>
          {REVIEW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground">{data?.total ?? 0} accounts</span>
        {!!rows.length && (
          <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => bulk.mutate("needs_review")}>
            Mark listed as needs review
          </Button>
        )}
      </div>

      {!rows.length ? (
        <p className="text-sm text-muted-foreground">No accounts match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Account</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Groups</th>
                <th className="py-2 pr-3 font-medium">Records</th>
                <th className="py-2 pr-3 font-medium">Flags</th>
                <th className="py-2 pr-3 font-medium">Review</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border/50 align-top">
                  <td className="py-2 pr-3">
                    <button className="text-left hover:underline" onClick={() => setOpenId(a.id)}>
                      {a.canonical_name || a.account_name}
                    </button>
                    <p className="text-xs text-muted-foreground">{(a.emails ?? []).join(", ") || "—"}</p>
                  </td>
                  <td className="py-2 pr-3">
                    {classificationMode ? (
                      <select
                        className="h-8 rounded-md border border-border bg-background px-1 text-xs"
                        value={a.account_type}
                        onChange={(e) =>
                          classify.mutate({ account_id: a.id, account_type: e.target.value })
                        }
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      a.account_type
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">{(a.groupnames ?? []).join(", ") || "—"}</td>
                  <td className="py-2 pr-3 tabular-nums">{a.source_record_count}</td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">
                    {(a.quality_flags ?? []).join(", ") || "—"}
                  </td>
                  <td className="py-2 pr-3">
                    <Badge variant={STATUS_VARIANT[a.review_status] ?? "outline"}>
                      {a.review_status.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ account_id: a.id, review_status: "approved" })}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={review.isPending}
                        onClick={() => review.mutate({ account_id: a.id, review_status: "rejected" })}
                      >
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openId && <AccountDossierDialog accountId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );

  if (embedded) return body;
  return (
    <SectionCard
      title={classificationMode ? "Unknown classification queue" : "Account review"}
      description={
        classificationMode
          ? "Change a classification to record the previous value, reviewer and timestamp in the audit log."
          : "Approve, reject or defer each normalized account candidate."
      }
    >
      {body}
    </SectionCard>
  );
}

/* ---------------------------------------------------------------- dossier */

function AccountDossierDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const fn = useServerFn(getRespadAccountDossier);
  const saveFn = useServerFn(updateRespadCanonicalAccount);
  const q = useQuery({
    queryKey: ["respad", "dossier", accountId],
    queryFn: () => fn({ data: { account_id: accountId } }),
  });
  const d = q.data as Row | undefined;
  const a = d?.account;
  const [patch, setPatch] = useState<Record<string, string>>({});

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          account_id: accountId,
          patch,
          contacts: (a?.emails ?? []).map((email: string) => ({ email, label: "respad" })),
          notes: null,
        },
      }),
    onSuccess: () => {
      toast.success("Canonical values saved");
      qc.invalidateQueries({ queryKey: ["respad"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canonicalField = (key: string, label: string, fallback?: string | string[] | null) => (
    <label className="block text-xs">
      <span className="text-muted-foreground">
        {label} <span className="opacity-70">(ResPad: {Array.isArray(fallback) ? fallback.join(", ") || "—" : fallback || "—"})</span>
      </span>
      <Input
        className="mt-1"
        value={patch[key] ?? a?.[key] ?? ""}
        onChange={(e) => setPatch((s) => ({ ...s, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{a?.account_name ?? "Account"}</DialogTitle>
          <DialogDescription>
            Canonical values are additive — the original ResPad record, client name, company id, group and
            source file are always preserved.
          </DialogDescription>
        </DialogHeader>

        {!a ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              {canonicalField("canonical_name", "Canonical name", a.account_name)}
              {canonicalField("canonical_account_type", "Canonical type", a.account_type)}
              {canonicalField("canonical_email", "Canonical email", a.emails)}
              {canonicalField("canonical_phone", "Canonical phone", a.phones)}
              {canonicalField("canonical_mobile", "Canonical mobile", a.phones)}
              {canonicalField("canonical_website", "Canonical website", a.websites)}
              {canonicalField("canonical_tin", "Canonical TIN", a.tins)}
              {canonicalField("canonical_vrn", "Canonical VRN", a.vrns)}
              {canonicalField("canonical_address", "Canonical address", a.addresses)}
              {canonicalField("canonical_notes", "Canonical notes", a.notes)}
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Source records ({d?.sources?.length ?? 0})
              </p>
              <div className="space-y-2">
                {(d?.sources ?? []).map((s: Row) => (
                  <div key={s.id} className="rounded-md border border-border p-3 text-xs">
                    <p className="font-medium">
                      {s.legacy_clientname} · {s.source_file} · row {s.source_row_index}
                    </p>
                    <p className="text-muted-foreground">
                      group: {s.legacy_groupname || "—"} · company id: {s.legacy_company_id || "—"} · TIN:{" "}
                      {s.legacy_tin || "—"} · VRN: {s.legacy_vrn || "—"}
                    </p>
                    <p className="text-muted-foreground">
                      {s.legacy_email || "—"} · {s.legacy_telephone || "—"} · {s.legacy_mobile || "—"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Commercial group relationships ({d?.relationships?.length ?? 0})
              </p>
              <div className="flex flex-wrap gap-2">
                {(d?.relationships ?? []).map((r: Row) => (
                  <Badge key={r.id} variant="outline" className="font-normal">
                    {r.legacy_groupname} · {r.source_file}
                  </Badge>
                ))}
              </div>
            </div>

            {!!(a.emails ?? []).length && (
              <div>
                <p className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  All email addresses (retained, none discarded)
                </p>
                <div className="flex flex-wrap gap-2">
                  {(a.emails ?? []).map((e: string) => (
                    <Badge key={e} variant="secondary" className="font-normal">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button disabled={save.isPending || !a} onClick={() => save.mutate()}>
            Save canonical values
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
