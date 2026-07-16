import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, Send, CalendarClock, Archive } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { LoadingState } from "@/components/os/LoadingState";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TiptapEditor } from "@/components/os/content/TiptapEditor";
import { toast } from "sonner";
import {
  getJournalArticle,
  upsertJournalArticle,
  publishJournalArticle,
  scheduleJournalArticle,
  archiveJournalArticle,
} from "@/domains/content/journal/journal.functions";

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
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.journal.article", id],
    queryFn: () => getFn({ data: { id } }),
  });

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
  });
  const [scheduleAt, setScheduleAt] = useState("");

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
    });
    if (data.scheduled_at) setScheduleAt(new Date(data.scheduled_at).toISOString().slice(0, 16));
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => saveFn({ data: { id, ...form } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      toast.success("Article saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      await saveFn({ data: { id, ...form } });
      return publishFn({ data: { id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.journal.article", id] });
      toast.success("Published");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      if (!scheduleAt) throw new Error("Pick a date/time");
      await saveFn({ data: { id, ...form } });
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

  if (isLoading || !data) return <LoadingState />;

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
            <label className="block text-xs">Read time (minutes)
              <Input type="number" value={form.read_minutes} onChange={(e) => setForm((f) => ({ ...f, read_minutes: Number(e.target.value) }))} />
            </label>
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
    </div>
  );
}