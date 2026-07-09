import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Plus, Trash2, Pencil, Star, Sparkles, Zap, ListChecks, BarChart3, PenLine, Download } from "lucide-react";
import {
  listAllReviews,
  createReview,
  updateReview,
  deleteReview,
} from "@/lib/reviews.functions";
import { importReview, generateReviewSummaries } from "@/lib/review-import.functions";
import { listReviewStatistics, upsertReviewStatistic } from "@/lib/review-stats.functions";
import { listActivityLogs } from "@/lib/activity.functions";
import {
  REVIEW_CATEGORIES,
  SOURCE_LABELS,
  type Review,
  type ReviewCategory,
  type ReviewSource,
  type ReviewStatus,
  type ReviewStatistics,
} from "@/lib/reviews";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews — Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminReviews,
});

type TabKey = "manual" | "import" | "quick" | "activity" | "statistics";

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "manual", label: "Manual Entry", icon: PenLine },
  { key: "import", label: "Import Review", icon: Sparkles },
  { key: "quick", label: "Quick Add", icon: Zap },
  { key: "activity", label: "Activity Log", icon: ListChecks },
  { key: "statistics", label: "Statistics", icon: BarChart3 },
];

const statusColors: Record<ReviewStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  archived: "bg-zinc-200 text-zinc-700",
};

type FormState = {
  source: ReviewSource;
  guest_name: string;
  guest_location: string;
  rating: number;
  title: string;
  review_text: string;
  review_date: string;
  categories: ReviewCategory[];
  status: ReviewStatus;
  featured: boolean;
  external_url: string;
  original_review?: string;
  short_summary?: string;
  medium_summary?: string;
  imported_from?: string;
  review_url?: string;
};

const blankForm: FormState = {
  source: "google",
  guest_name: "",
  guest_location: "",
  rating: 5,
  title: "",
  review_text: "",
  review_date: new Date().toISOString().slice(0, 10),
  categories: [],
  status: "pending",
  featured: false,
  external_url: "",
  original_review: "",
  short_summary: "",
  medium_summary: "",
  imported_from: "",
  review_url: "",
};

function AdminReviews() {
  const [tab, setTab] = useState<TabKey>("manual");
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | ReviewSource>("all");
  const [editing, setEditing] = useState<Review | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [prefill, setPrefill] = useState<FormState | null>(null);

  const listFn = useServerFn(listAllReviews);
  const createFn = useServerFn(createReview);
  const updateFn = useServerFn(updateReview);
  const deleteFn = useServerFn(deleteReview);
  const qc = useQueryClient();

  const reviews = useQuery({
    queryKey: ["admin-reviews", statusFilter, sourceFilter],
    queryFn: () => listFn({ data: { status: statusFilter, source: sourceFilter } }),
    enabled: tab === "manual" || tab === "quick",
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    qc.invalidateQueries({ queryKey: ["reviews"] });
    qc.invalidateQueries({ queryKey: ["review-aggregates"] });
    qc.invalidateQueries({ queryKey: ["review-statistics"] });
    qc.invalidateQueries({ queryKey: ["activity-logs"] });
  };

  const create = useMutation({
    mutationFn: (vars: FormState) => createFn({ data: cleanForm(vars) }),
    onSuccess: () => {
      toast.success("Review added");
      setShowForm(false);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<FormState> }) =>
      updateFn({ data: { id: vars.id, patch: cleanForm(vars.patch as FormState) } }),
    onSuccess: () => {
      toast.success("Review updated");
      setEditing(null);
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Review deleted");
      invalidateAll();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const quickStatus = (r: Review, status: ReviewStatus) =>
    update.mutate({ id: r.id, patch: { ...formFromReview(r), status } });
  const toggleFeature = (r: Review) =>
    update.mutate({ id: r.id, patch: { ...formFromReview(r), featured: !r.featured } });

  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  return (
    <div className="min-h-screen bg-ivory text-charcoal">
      <header className="border-b border-charcoal/10 bg-ivory">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-display text-lg">Mtoni · Admin</Link>
            <nav className="hidden gap-4 text-xs uppercase tracking-[0.22em] text-charcoal/60 sm:flex">
              <Link to="/admin/bookings" className="hover:text-charcoal">Bookings</Link>
              <Link to="/admin/reviews" className="text-charcoal">Reviews</Link>
            </nav>
          </div>
          <button onClick={signOut} className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-display text-3xl">Reviews Admin</h1>
          {(tab === "manual" || tab === "quick") && (
            <button
              onClick={() => { setEditing(null); setPrefill(null); setShowForm(true); }}
              className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85"
            >
              <Plus className="h-3.5 w-3.5" /> Add review
            </button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-1 border-b border-charcoal/10">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-[0.7rem] uppercase tracking-[0.22em] transition-colors ${
                  active
                    ? "border-charcoal text-charcoal"
                    : "border-transparent text-charcoal/55 hover:text-charcoal"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "manual" && (
          <ManualEntryPanel
            reviews={reviews}
            statusFilter={statusFilter}
            sourceFilter={sourceFilter}
            onStatusFilter={setStatusFilter}
            onSourceFilter={setSourceFilter}
            onEdit={(r) => { setEditing(r); setPrefill(null); setShowForm(true); }}
            onQuickStatus={(r, status) =>
              update.mutate({ id: r.id, patch: { ...formFromReview(r), status } })
            }
            onToggleFeature={(r) =>
              update.mutate({ id: r.id, patch: { ...formFromReview(r), featured: !r.featured } })
            }
            onDelete={(id) => remove.mutate(id)}
          />
        )}

        {tab === "import" && (
          <ImportPanel
            onImported={(f) => { setEditing(null); setPrefill(f); setShowForm(true); setTab("manual"); }}
          />
        )}
        {tab === "quick" && <QuickAddPanel onSaved={invalidateAll} />}
        {tab === "activity" && <ActivityLogPanel />}
        {tab === "statistics" && <StatisticsPanel />}
      </main>

      {showForm && (
        <ReviewForm
          initial={editing ? formFromReview(editing) : (prefill ?? blankForm)}
          isEditing={!!editing}
          submitting={create.isPending || update.isPending}
          onCancel={() => { setShowForm(false); setEditing(null); setPrefill(null); }}
          onSubmit={(values) => {
            if (editing) update.mutate({ id: editing.id, patch: values });
            else create.mutate(values);
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Manual Entry panel (existing table + filters — unchanged in behavior)
// ============================================================================

function ManualEntryPanel({
  reviews, statusFilter, sourceFilter, onStatusFilter, onSourceFilter,
  onEdit, onQuickStatus, onToggleFeature, onDelete,
}: {
  reviews: ReturnType<typeof useQuery<Review[]>>;
  statusFilter: "all" | ReviewStatus;
  sourceFilter: "all" | ReviewSource;
  onStatusFilter: (v: "all" | ReviewStatus) => void;
  onSourceFilter: (v: "all" | ReviewSource) => void;
  onEdit: (r: Review) => void;
  onQuickStatus: (r: Review, s: ReviewStatus) => void;
  onToggleFeature: (r: Review) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-charcoal/10 bg-bone/40 p-4">
        <div>
          <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Status</label>
          <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value as any)} className="mt-1 rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div>
          <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Source</label>
          <select value={sourceFilter} onChange={(e) => onSourceFilter(e.target.value as any)} className="mt-1 rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
            <option value="all">All</option>
            <option value="google">Google</option>
            <option value="tripadvisor">Tripadvisor</option>
            <option value="direct">Direct</option>
          </select>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-charcoal/10 bg-ivory">
        {reviews.isLoading && (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-charcoal/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        )}
        {reviews.error && <div className="p-6 text-sm text-rose-700">{(reviews.error as Error).message}</div>}
        {reviews.data && reviews.data.length === 0 && <div className="p-10 text-center text-sm text-charcoal/60">No reviews yet.</div>}
        {reviews.data && reviews.data.length > 0 && (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-bone/40 text-left text-[0.65rem] uppercase tracking-[0.18em] text-charcoal/60">
              <tr>
                <th className="px-4 py-3">Guest</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Categories</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">★</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {reviews.data.map((r) => (
                <tr key={r.id} className="border-t border-charcoal/10 hover:bg-bone/30 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.guest_name}</div>
                    <div className="text-xs text-charcoal/60">{r.guest_location ?? "—"}</div>
                    {r.title && <div className="mt-1 text-xs italic text-charcoal/70">{r.title}</div>}
                    <div className="mt-1 line-clamp-2 max-w-md text-xs text-charcoal/70">{r.review_text}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{SOURCE_LABELS[r.source]}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.rating} / 5</td>
                  <td className="px-4 py-3 whitespace-nowrap">{r.review_date}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.categories.map((c) => (
                        <span key={c} className="rounded-full bg-charcoal/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.15em] text-charcoal/70">{c.replace("_", " ")}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      onChange={(e) => onQuickStatus(r, e.target.value as ReviewStatus)}
                      className={`rounded-full border-0 px-2 py-1 text-[0.65rem] uppercase tracking-[0.15em] ${statusColors[r.status]}`}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="archived">Archived</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => onToggleFeature(r)} title="Featured" className={r.featured ? "text-gold" : "text-charcoal/30 hover:text-gold"}>
                      <Star className={`h-4 w-4 ${r.featured ? "fill-current" : ""}`} strokeWidth={r.featured ? 0 : 1.6} />
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <button onClick={() => onEdit(r)} className="mr-3 inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-charcoal/70 hover:text-charcoal">
                      <Pencil className="h-3 w-3" /> Edit
                    </button>
                    <button
                      onClick={() => { if (confirm("Delete this review permanently?")) onDelete(r.id); }}
                      className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-rose-700 hover:text-rose-900"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Import panel — paste text or URL, AI extracts + summarizes, opens form
// ============================================================================

function ImportPanel({ onImported }: { onImported: (f: FormState) => void }) {
  const importFn = useServerFn(importReview);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [sourceHint, setSourceHint] = useState<ReviewSource>("google");

  const mutation = useMutation({
    mutationFn: () =>
      importFn({ data: { text, url: url || undefined, source_hint: sourceHint } }),
    onSuccess: (r) => {
      toast.success("Review parsed. Review the details and save.");
      const form: FormState = {
        source: r.source,
        guest_name: r.guest_name,
        guest_location: r.guest_location ?? "",
        rating: r.rating,
        title: r.title ?? "",
        review_text: r.short_summary || r.original_review,
        review_date: r.review_date,
        categories: [],
        status: "pending",
        featured: false,
        external_url: url,
        original_review: r.original_review,
        short_summary: r.short_summary,
        medium_summary: r.medium_summary,
        imported_from: r.source,
        review_url: url,
      };
      onImported(form);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 grid gap-6">
      <div className="rounded-xl border border-charcoal/10 bg-bone/40 p-6">
        <h2 className="font-display text-xl">Import a review with AI</h2>
        <p className="mt-2 text-sm text-charcoal/70">
          Paste the review text from Google Maps, Tripadvisor, or an email/WhatsApp message.
          AI extracts guest name, rating, date and generates short & medium summaries.
          Nothing is published — you'll review and approve everything before saving.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Platform</span>
            <select
              value={sourceHint}
              onChange={(e) => setSourceHint(e.target.value as ReviewSource)}
              className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm"
            >
              <option value="google">Google</option>
              <option value="tripadvisor">Tripadvisor</option>
              <option value="direct">Direct guest</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">
              Review URL (optional)
            </span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm"
            />
          </label>
        </div>

        <label className="mt-4 grid gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">
            Pasted review text *
          </span>
          <textarea
            required
            rows={10}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Paste the full review here — include the guest's name, date, star rating and their words."}
            className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm"
          />
        </label>

        <div className="mt-5 flex justify-end">
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || text.trim().length < 20}
            className="inline-flex items-center gap-2 rounded-full bg-charcoal px-6 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Parse with AI
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Quick Add panel — minimal fields, one-click save
// ============================================================================

function QuickAddPanel({ onSaved }: { onSaved: () => void }) {
  const createFn = useServerFn(createReview);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(5);
  const [source, setSource] = useState<ReviewSource>("direct");
  const [text, setText] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          source,
          guest_name: name.trim(),
          guest_location: null,
          rating,
          title: null,
          review_text: text.trim(),
          review_date: new Date().toISOString().slice(0, 10),
          categories: [],
          status: "approved",
          featured: false,
          external_url: null,
        } as any,
      }),
    onSuccess: () => {
      toast.success("Review added");
      setName(""); setText(""); setRating(5);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 max-w-2xl rounded-xl border border-charcoal/10 bg-bone/40 p-6">
      <h2 className="font-display text-xl">Quick add</h2>
      <p className="mt-2 text-sm text-charcoal/70">
        Ideal for WhatsApp messages, guest-book entries and offline reviews. Publishes immediately as approved.
      </p>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-1 sm:col-span-2">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Guest name *</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Rating *</span>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} ★</option>)}
            </select>
          </label>
          <label className="grid gap-1 sm:col-span-3">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Platform</span>
            <select value={source} onChange={(e) => setSource(e.target.value as ReviewSource)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
              <option value="direct">Direct guest</option>
              <option value="google">Google</option>
              <option value="tripadvisor">Tripadvisor</option>
            </select>
          </label>
        </div>
        <label className="grid gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Short review *</span>
          <textarea required rows={4} value={text} onChange={(e) => setText(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
        </label>
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={mutation.isPending || !name.trim() || !text.trim()}
            className="inline-flex items-center gap-2 rounded-full bg-charcoal px-6 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
            Save review
          </button>
        </div>
      </form>
    </div>
  );
}

// ============================================================================
// Activity Log panel
// ============================================================================

const ACTION_LABELS: Record<string, string> = {
  review_created: "Created",
  review_edited: "Edited",
  review_deleted: "Deleted",
  review_published: "Published",
  review_unpublished: "Unpublished",
  featured_enabled: "Featured on",
  featured_disabled: "Featured off",
  review_imported: "Imported",
  statistics_updated: "Stats updated",
};

function ActivityLogPanel() {
  const listFn = useServerFn(listActivityLogs);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [actorEmail, setActorEmail] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const q = useQuery({
    queryKey: ["activity-logs", search, action, actorEmail, from, to],
    queryFn: () =>
      listFn({
        data: {
          search: search || undefined,
          action: action || undefined,
          actorEmail: actorEmail || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      }),
  });

  const exportCsv = () => {
    const rows = q.data ?? [];
    const header = ["timestamp", "actor", "action", "entity", "entity_id", "ip", "user_agent"];
    const csv = [header.join(",")].concat(
      rows.map((r: any) =>
        [
          r.created_at,
          r.actor_email ?? "",
          r.action,
          (r.entity_label ?? "").replace(/"/g, '""'),
          r.entity_id ?? "",
          r.ip_address ?? "",
          (r.user_agent ?? "").replace(/"/g, '""'),
        ]
          .map((v) => `"${String(v)}"`)
          .join(","),
      ),
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mt-6">
      <div className="rounded-xl border border-charcoal/10 bg-bone/40 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="guest, action, email" className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Action</span>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
              <option value="">All</option>
              {Object.entries(ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Admin email</span>
            <input value={actorEmail} onChange={(e) => setActorEmail(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">From</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">To</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={exportCsv}
            disabled={!q.data || q.data.length === 0}
            className="inline-flex items-center gap-2 rounded-full border border-charcoal/20 px-4 py-2 text-[0.65rem] uppercase tracking-[0.22em] hover:bg-charcoal/5 disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-charcoal/10 bg-ivory">
        {q.isLoading && <div className="flex items-center justify-center gap-2 p-10 text-sm text-charcoal/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {q.error && <div className="p-6 text-sm text-rose-700">{(q.error as Error).message}</div>}
        {q.data && q.data.length === 0 && <div className="p-10 text-center text-sm text-charcoal/60">No log entries match.</div>}
        {q.data && q.data.length > 0 && (
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-bone/40 text-left text-[0.65rem] uppercase tracking-[0.18em] text-charcoal/60">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody>
              {(q.data as any[]).map((r) => (
                <tr key={r.id} className="border-t border-charcoal/10 align-top hover:bg-bone/30">
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-charcoal/70">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.actor_email ?? "—"}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-[0.15em]">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </td>
                  <td className="px-4 py-3 text-xs">{r.entity_label ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-charcoal/60">
                    {r.previous_value && r.new_value ? (
                      <ChangeSummary prev={r.previous_value} next={r.new_value} />
                    ) : (
                      <span className="text-charcoal/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ChangeSummary({ prev, next }: { prev: any; next: any }) {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})]);
  const diffs: string[] = [];
  for (const k of keys) {
    const a = JSON.stringify((prev ?? {})[k]);
    const b = JSON.stringify((next ?? {})[k]);
    if (a !== b && ["status", "featured", "rating", "review_text", "guest_name", "overall_rating", "total_reviews", "profile_url"].includes(k)) {
      diffs.push(`${k}: ${trunc(a)} → ${trunc(b)}`);
    }
  }
  if (diffs.length === 0) return <span className="text-charcoal/40">—</span>;
  return <span>{diffs.slice(0, 3).join(" · ")}</span>;
}
function trunc(s: string | undefined) {
  if (!s) return "—";
  return s.length > 40 ? s.slice(0, 40) + "…" : s;
}

// ============================================================================
// Statistics panel — editable Google / Tripadvisor / Direct stats
// ============================================================================

function StatisticsPanel() {
  const listFn = useServerFn(listReviewStatistics);
  const upsertFn = useServerFn(upsertReviewStatistic);
  const qc = useQueryClient();

  const q = useQuery({ queryKey: ["review-statistics"], queryFn: () => listFn() });

  const mutation = useMutation({
    mutationFn: (v: { source: ReviewSource; overall_rating: number; total_reviews: number; profile_url: string }) =>
      upsertFn({ data: v }),
    onSuccess: () => {
      toast.success("Statistics updated");
      qc.invalidateQueries({ queryKey: ["review-statistics"] });
      qc.invalidateQueries({ queryKey: ["review-aggregates"] });
      qc.invalidateQueries({ queryKey: ["activity-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mt-6 grid gap-4">
      {q.isLoading && <div className="flex items-center gap-2 text-sm text-charcoal/60"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
      {q.data?.map((s) => (
        <StatCard key={s.source} stat={s} onSave={mutation.mutate} saving={mutation.isPending} />
      ))}
    </div>
  );
}

function StatCard({
  stat, onSave, saving,
}: {
  stat: ReviewStatistics;
  onSave: (v: { source: ReviewSource; overall_rating: number; total_reviews: number; profile_url: string }) => void;
  saving: boolean;
}) {
  const [rating, setRating] = useState(stat.overall_rating);
  const [count, setCount] = useState(stat.total_reviews);
  const [url, setUrl] = useState(stat.profile_url ?? "");
  const invalid = rating < 0 || rating > 5 || count < 0 || !Number.isFinite(rating) || !Number.isFinite(count);

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ source: stat.source, overall_rating: rating, total_reviews: count, profile_url: url }); }}
      className="rounded-xl border border-charcoal/10 bg-ivory p-6"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg capitalize">{SOURCE_LABELS[stat.source]}</h3>
        <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/50">
          Last updated {new Date(stat.updated_at).toLocaleString()}
        </span>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <label className="grid gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Overall rating (0–5)</span>
          <input type="number" step="0.1" min={0} max={5} value={rating} onChange={(e) => setRating(Number(e.target.value))} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
        </label>
        <label className="grid gap-1">
          <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Total reviews</span>
          <input type="number" min={0} step={1} value={count} onChange={(e) => setCount(Number(e.target.value))} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
        </label>
        <label className="grid gap-1 sm:col-span-1">
          <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Profile URL</span>
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm" />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={saving || invalid}
          className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Update statistics
        </button>
      </div>
    </form>
  );
}

function formFromReview(r: Review): FormState {
  return {
    source: r.source,
    guest_name: r.guest_name,
    guest_location: r.guest_location ?? "",
    rating: r.rating,
    title: r.title ?? "",
    review_text: r.review_text,
    review_date: r.review_date,
    categories: r.categories,
    status: r.status,
    featured: r.featured,
    external_url: r.external_url ?? "",
    original_review: r.original_review ?? "",
    short_summary: r.short_summary ?? "",
    medium_summary: r.medium_summary ?? "",
    imported_from: r.imported_from ?? "",
    review_url: r.review_url ?? "",
  };
}

function cleanForm(f: FormState) {
  return {
    ...f,
    guest_location: f.guest_location || null,
    title: f.title || null,
    external_url: f.external_url || null,
    original_review: f.original_review || null,
    short_summary: f.short_summary || null,
    medium_summary: f.medium_summary || null,
    imported_from: f.imported_from || null,
    review_url: f.review_url || null,
  };
}

function ReviewForm({
  initial, isEditing, submitting, onCancel, onSubmit,
}: {
  initial: FormState;
  isEditing: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (v: FormState) => void;
}) {
  const [f, setF] = useState<FormState>(initial);
  const toggleCat = (c: ReviewCategory) =>
    setF((p) => ({ ...p, categories: p.categories.includes(c) ? p.categories.filter((x) => x !== c) : [...p.categories, c] }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 sm:items-center sm:p-4" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-ivory p-6 sm:rounded-2xl sm:p-8" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-display text-2xl">{isEditing ? "Edit review" : "Add review"}</h2>
          <button onClick={onCancel} className="text-xs uppercase tracking-[0.22em] text-charcoal/60 hover:text-charcoal">Close</button>
        </div>
        <form
          className="mt-5 grid gap-4 text-sm"
          onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Source *</span>
              <select required value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as ReviewSource })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2">
                <option value="google">Google</option>
                <option value="tripadvisor">Tripadvisor</option>
                <option value="direct">Direct guest</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Rating *</span>
              <select required value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Guest name *</span>
              <input required value={f.guest_name} onChange={(e) => setF({ ...f, guest_name: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Location</span>
              <input value={f.guest_location} onChange={(e) => setF({ ...f, guest_location: e.target.value })} placeholder="e.g. United Kingdom" className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Review date *</span>
              <input required type="date" value={f.review_date} onChange={(e) => setF({ ...f, review_date: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
            </label>
            <label className="grid gap-1">
              <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Status</span>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as ReviewStatus })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2">
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="archived">Archived</option>
              </select>
            </label>
          </div>

          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Title</span>
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Short headline" className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Review text *</span>
            <textarea required rows={5} value={f.review_text} onChange={(e) => setF({ ...f, review_text: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Short summary (homepage cards · 20–30 words)</span>
            <textarea rows={2} value={f.short_summary ?? ""} onChange={(e) => setF({ ...f, short_summary: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Medium summary (reviews page · 40–70 words)</span>
            <textarea rows={3} value={f.medium_summary ?? ""} onChange={(e) => setF({ ...f, medium_summary: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>
          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Original review (verbatim, for reference)</span>
            <textarea rows={3} value={f.original_review ?? ""} onChange={(e) => setF({ ...f, original_review: e.target.value })} className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>

          <label className="grid gap-1">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">External URL</span>
            <input type="url" value={f.external_url} onChange={(e) => setF({ ...f, external_url: e.target.value })} placeholder="https://" className="rounded-md border border-charcoal/15 bg-ivory px-3 py-2" />
          </label>

          <div className="grid gap-2">
            <span className="text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Category tags</span>
            <div className="flex flex-wrap gap-2">
              {REVIEW_CATEGORIES.map((c) => {
                const on = f.categories.includes(c.value);
                return (
                  <button
                    type="button"
                    key={c.value}
                    onClick={() => toggleCat(c.value)}
                    className={`rounded-full border px-3 py-1.5 text-xs uppercase tracking-[0.18em] transition-colors ${
                      on ? "border-charcoal bg-charcoal text-ivory" : "border-charcoal/20 text-charcoal/70 hover:border-charcoal/50"
                    }`}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
            Featured testimonial
          </label>

          <div className="mt-3 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="rounded-full border border-charcoal/20 px-5 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] hover:bg-charcoal/5">Cancel</button>
            <button type="submit" disabled={submitting} className="inline-flex items-center gap-2 rounded-full bg-charcoal px-6 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85 disabled:opacity-50">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save changes" : "Add review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}