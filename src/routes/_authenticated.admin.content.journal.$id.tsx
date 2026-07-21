import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Send, CalendarClock, Archive, History, Star } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { LoadingState } from "@/components/os/LoadingState";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { TiptapEditor } from "@/components/os/content/TiptapEditor";
import { toast } from "sonner";
import {
  getJournalArticle,
  upsertJournalArticle,
  publishJournalArticle,
  scheduleJournalArticle,
  archiveJournalArticle,
  listJournalTaxonomies,
  listArticleTagIds,
  setArticleTags,
  setArticleFeatured,
  listArticleVersions,
  snapshotJournalArticle,
  restoreJournalArticleVersion,
  getRelatedArticles,
  getInternalLinkSuggestions,
} from "@/domains/content/journal/journal.functions";
import { computeReadMinutes, extractToc } from "@/lib/journal-utils";

export const Route = createFileRoute("/_authenticated/admin/content/journal/$id")({
  head: () => ({ meta: [{ title: "Edit Article — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: JournalEditorPage,
});

const statusTone: Record<string, StatusTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "warning",
};

function JournalEditorPage() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getJournalArticle);
  const saveFn = useServerFn(upsertJournalArticle);
  const publishFn = useServerFn(publishJournalArticle);
  const scheduleFn = useServerFn(scheduleJournalArticle);
  const archiveFn = useServerFn(archiveJournalArticle);
  const taxonomiesFn = useServerFn(listJournalTaxonomies);
  const tagIdsFn = useServerFn(listArticleTagIds);
  const setTagsFn = useServerFn(setArticleTags);
  const setFeaturedFn = useServerFn(setArticleFeatured);
  const versionsFn = useServerFn(listArticleVersions);
  const snapshotFn = useServerFn(snapshotJournalArticle);
  const restoreVersionFn = useServerFn(restoreJournalArticleVersion);
  const relatedFn = useServerFn(getRelatedArticles);
  const suggestFn = useServerFn(getInternalLinkSuggestions);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.journal.article", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const taxonomiesQ = useQuery({ queryKey: ["admin.journal.taxonomies"], queryFn: () => taxonomiesFn({}) });
  const tagIdsQ = useQuery({ queryKey: ["admin.journal.article.tags", id], queryFn: () => tagIdsFn({ data: { articleId: id } }) });
  const versionsQ = useQuery({ queryKey: ["admin.journal.article.versions", id], queryFn: () => versionsFn({ data: { articleId: id } }) });
  const relatedQ = useQuery({ queryKey: ["admin.journal.article.related", id], queryFn: () => relatedFn({ data: { articleId: id, limit: 4 } }) });

  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    cover_image_url: "",
    read_minutes: 0,
    seo_title: "",
    seo_description: "",
    seo_og_image: "",
    content_html: "",
    content_json: null as unknown,
    author_id: "",
    category_id: "",
    featured: false,
  });
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [scheduleAt, setScheduleAt] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; slug: string; title: string; matched: string[] }>>([]);

  useEffect(() => {
    if (!data) return;
    setForm({
      title: data.title ?? "",
      slug: data.slug ?? "",
      excerpt: data.excerpt ?? "",
      cover_image_url: data.cover_image_url ?? "",
      read_minutes: data.read_minutes ?? 0,
      seo_title: data.seo_title ?? "",
      seo_description: data.seo_description ?? "",
      seo_og_image: data.seo_og_image ?? "",
      content_html: data.content_html ?? "",
      content_json: data.content_json,
      author_id: data.author_id ?? "",
      category_id: data.category_id ?? "",
      featured: Boolean((data as { featured?: boolean }).featured),
    });
    if (data.scheduled_at) setScheduleAt(new Date(data.scheduled_at).toISOString().slice(0, 16));
  }, [data]);

  useEffect(() => { if (tagIdsQ.data) setSelectedTags(new Set(tagIdsQ.data)); }, [tagIdsQ.data]);

  const toc = useMemo(() => extractToc(form.content_html), [form.content_html]);
  const autoReadMinutes = useMemo(() => computeReadMinutes(form.content_html), [form.content_html]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = { ...form, read_minutes: form.read_minutes || autoReadMinutes,
        author_id: form.author_id || null, category_id: form.category_id || null };
      await saveFn({ data: { id, ...payload } });
      await setFeaturedFn({ data: { id, featured: form.featured } });
      await setTagsFn({ data: { articleId: id, tagIds: Array.from(selectedTags) } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      qc.invalidateQueries({ queryKey: ["admin.journal.article.tags", id] });
      toast.success("Article saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      await snapshotFn({ data: { id, note: "Auto-snapshot on publish" } });
      return publishFn({ data: { id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      qc.invalidateQueries({ queryKey: ["admin.journal.article.versions", id] });
      toast.success("Published");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!scheduleAt) throw new Error("Pick a date/time");
      await saveMut.mutateAsync();
      return scheduleFn({ data: { id, scheduledAt: new Date(scheduleAt).toISOString() } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      toast.success("Scheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      toast.success("Archived");
    },
  });

  const snapshotMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return snapshotFn({ data: { id, note: "Manual snapshot" } });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article.versions", id] });
      toast.success(`Snapshot v${r.version} saved`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreVersionMut = useMutation({
    mutationFn: (versionId: string) => restoreVersionFn({ data: { versionId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      qc.invalidateQueries({ queryKey: ["admin.journal.article.tags", id] });
      setVersionsOpen(false);
      toast.success("Version restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const suggestMut = useMutation({
    mutationFn: () => {
      const text = `${form.title} ${form.excerpt} ${form.content_html}`.trim();
      if (!text || text.length < 20) {
        throw new Error("Add some body content before scanning for internal links.");
      }
      return suggestFn({ data: { articleId: id, text } });
    },
    onSuccess: (rows) => {
      setSuggestions(rows);
      if (!rows.length) toast.info("No related published articles matched this content yet.");
      else toast.success(`Found ${rows.length} suggestion${rows.length === 1 ? "" : "s"}.`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <LoadingState />;
  const taxonomies = taxonomiesQ.data ?? { authors: [], categories: [], tags: [] };

  return (
    <div className="space-y-6">
      <PageHeader
        title={form.title || "Untitled"}
        description={`/${form.slug || data.slug}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip tone={statusTone[data.status] ?? "neutral"}>{data.status}</StatusChip>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/content/journal"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
              <History className="mr-1 h-4 w-4" /> Versions
            </Button>
            <Button variant="ghost" size="sm" onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending}>
              Snapshot
            </Button>
            <Button variant="outline" size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              <Save className="mr-1 h-4 w-4" /> Save
            </Button>
            <Button size="sm" onClick={() => publishMut.mutate()} disabled={publishMut.isPending}>
              <Send className="mr-1 h-4 w-4" /> Publish
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Input
            className="text-lg"
            placeholder="Article title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          <Textarea
            placeholder="Excerpt (used on the journal index + social share)"
            rows={3}
            value={form.excerpt}
            onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
          />
          <TiptapEditor
            initialHtml={form.content_html}
            placeholder="Write your article…"
            onChange={({ html, json }) => setForm((f) => ({ ...f, content_html: html, content_json: json }))}
          />

          {toc.length > 0 ? (
            <section className="rounded-lg border border-border bg-card p-4">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Table of contents (auto)</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "pl-4 text-muted-foreground" : ""}>{t.text}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Internal link suggestions</h3>
              <Button size="sm" variant="ghost" onClick={() => suggestMut.mutate()} disabled={suggestMut.isPending}>
                {suggestMut.isPending ? "Scanning…" : "Scan content"}
              </Button>
            </div>
            {suggestions.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Scan your content to surface other published articles it may want to link to.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {suggestions.map((s) => (
                  <li key={s.id}>
                    <a href={`/journal/${s.slug}`} target="_blank" rel="noreferrer" className="underline">{s.title}</a>
                    <span className="ml-2 text-xs text-muted-foreground">matches: {s.matched.join(", ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Related articles (auto)</h3>
            {(relatedQ.data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">Add a category or tags to surface related stories.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {(relatedQ.data ?? []).map((r) => (
                  <li key={r.id}><a href={`/journal/${r.slug}`} target="_blank" rel="noreferrer" className="underline">{r.title}</a></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Metadata</h3>
            <label className="block text-xs">Slug
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </label>
            <label className="block text-xs">Cover image URL
              <Input value={form.cover_image_url} onChange={(e) => setForm((f) => ({ ...f, cover_image_url: e.target.value }))} />
            </label>
            <label className="block text-xs">Read time (minutes) <span className="text-muted-foreground">— auto: {autoReadMinutes}</span>
              <Input type="number" value={form.read_minutes} onChange={(e) => setForm((f) => ({ ...f, read_minutes: Number(e.target.value) }))} />
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={form.featured} onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))} />
              <Star className="h-3.5 w-3.5" /> Featured article
            </label>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Taxonomy</h3>
            <label className="block text-xs">Author
              <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={form.author_id} onChange={(e) => setForm((f) => ({ ...f, author_id: e.target.value }))}>
                <option value="">— None —</option>
                {taxonomies.authors.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="block text-xs">Category
              <select className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-sm"
                value={form.category_id} onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}>
                <option value="">— None —</option>
                {taxonomies.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="text-xs">
              <div className="mb-1">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {taxonomies.tags.map((t) => {
                  const active = selectedTags.has(t.id);
                  return (
                    <button key={t.id} type="button"
                      onClick={() => setSelectedTags((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })}
                      className={`rounded-full border px-2 py-0.5 text-xs ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                      {t.name}
                    </button>
                  );
                })}
                {taxonomies.tags.length === 0 ? <span className="text-muted-foreground">No tags yet.</span> : null}
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">SEO</h3>
            <label className="block text-xs">SEO title
              <Input value={form.seo_title} onChange={(e) => setForm((f) => ({ ...f, seo_title: e.target.value }))} />
            </label>
            <label className="block text-xs">Meta description
              <Textarea rows={2} value={form.seo_description} onChange={(e) => setForm((f) => ({ ...f, seo_description: e.target.value }))} />
            </label>
            <label className="block text-xs">OG image URL
              <Input value={form.seo_og_image} onChange={(e) => setForm((f) => ({ ...f, seo_og_image: e.target.value }))} />
            </label>
          </section>

          <section className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Publishing</h3>
            <label className="block text-xs">Schedule for
              <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            </label>
            <Button size="sm" variant="outline" className="w-full" onClick={() => scheduleMut.mutate()} disabled={scheduleMut.isPending}>
              <CalendarClock className="mr-1 h-4 w-4" /> Schedule
            </Button>
            <Button size="sm" variant="ghost" className="w-full" onClick={() => { if (confirm("Archive this article?")) archiveMut.mutate(); }}>
              <Archive className="mr-1 h-4 w-4" /> Archive
            </Button>
          </section>
        </aside>
      </div>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
          <div className="max-h-[420px] space-y-1 overflow-y-auto">
            {(versionsQ.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots yet. Publishing or the Snapshot button creates one.</p>
            ) : (
              (versionsQ.data ?? []).map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">v{v.version}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()} {v.note ? `· ${v.note}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm(`Restore v${v.version}? Current content will be replaced.`)) restoreVersionMut.mutate(v.id); }} disabled={restoreVersionMut.isPending}>
                    Restore
                  </Button>
                </div>
              ))
            )}
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setVersionsOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}