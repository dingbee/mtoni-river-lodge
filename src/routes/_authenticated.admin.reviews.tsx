import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, LogOut, Plus, Trash2, Pencil, Star } from "lucide-react";
import {
  listAllReviews,
  createReview,
  updateReview,
  deleteReview,
} from "@/lib/reviews.functions";
import {
  REVIEW_CATEGORIES,
  SOURCE_LABELS,
  type Review,
  type ReviewCategory,
  type ReviewSource,
  type ReviewStatus,
} from "@/lib/reviews";

export const Route = createFileRoute("/_authenticated/admin/reviews")({
  head: () => ({ meta: [{ title: "Reviews — Admin" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminReviews,
});

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
};

function AdminReviews() {
  const [statusFilter, setStatusFilter] = useState<"all" | ReviewStatus>("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | ReviewSource>("all");
  const [editing, setEditing] = useState<Review | null>(null);
  const [showForm, setShowForm] = useState(false);

  const listFn = useServerFn(listAllReviews);
  const createFn = useServerFn(createReview);
  const updateFn = useServerFn(updateReview);
  const deleteFn = useServerFn(deleteReview);
  const qc = useQueryClient();

  const reviews = useQuery({
    queryKey: ["admin-reviews", statusFilter, sourceFilter],
    queryFn: () => listFn({ data: { status: statusFilter, source: sourceFilter } }),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin-reviews"] });
    qc.invalidateQueries({ queryKey: ["reviews"] });
    qc.invalidateQueries({ queryKey: ["review-aggregates"] });
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
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Reviews</h1>
          <button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="inline-flex items-center gap-2 rounded-full bg-charcoal px-5 py-2.5 text-[0.7rem] uppercase tracking-[0.22em] text-ivory hover:bg-charcoal/85"
          >
            <Plus className="h-3.5 w-3.5" /> Add review
          </button>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3 rounded-xl border border-charcoal/10 bg-bone/40 p-4">
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="mt-1 rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-[0.6rem] uppercase tracking-[0.22em] text-charcoal/60">Source</label>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as any)} className="mt-1 rounded-md border border-charcoal/15 bg-ivory px-3 py-2 text-sm">
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
                        onChange={(e) => quickStatus(r, e.target.value as ReviewStatus)}
                        className={`rounded-full border-0 px-2 py-1 text-[0.65rem] uppercase tracking-[0.15em] ${statusColors[r.status]}`}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="archived">Archived</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => toggleFeature(r)} title="Featured" className={r.featured ? "text-gold" : "text-charcoal/30 hover:text-gold"}>
                        <Star className={`h-4 w-4 ${r.featured ? "fill-current" : ""}`} strokeWidth={r.featured ? 0 : 1.6} />
                      </button>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button onClick={() => { setEditing(r); setShowForm(true); }} className="mr-3 inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-charcoal/70 hover:text-charcoal">
                        <Pencil className="h-3 w-3" /> Edit
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete this review permanently?")) remove.mutate(r.id); }}
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
      </main>

      {showForm && (
        <ReviewForm
          initial={editing ? formFromReview(editing) : blankForm}
          isEditing={!!editing}
          submitting={create.isPending || update.isPending}
          onCancel={() => { setShowForm(false); setEditing(null); }}
          onSubmit={(values) => {
            if (editing) update.mutate({ id: editing.id, patch: values });
            else create.mutate(values);
          }}
        />
      )}
    </div>
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
  };
}

function cleanForm(f: FormState) {
  return {
    ...f,
    guest_location: f.guest_location || null,
    title: f.title || null,
    external_url: f.external_url || null,
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