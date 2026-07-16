import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, Save, Send, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { LoadingState } from "@/components/os/LoadingState";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  getCmsPage,
  upsertCmsPage,
  publishCmsPage,
  saveCmsBlocks,
  type CmsBlockKind,
} from "@/domains/content/pages/pages.functions";

export const Route = createFileRoute("/_authenticated/admin/content/pages/$id")({
  head: () => ({ meta: [{ title: "Edit Page — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PageEditor,
});

const statusTone: Record<string, StatusTone> = {
  draft: "neutral", review: "info", scheduled: "info", published: "success", archived: "warning",
};

const BLOCK_TYPES: { kind: CmsBlockKind; label: string }[] = [
  { kind: "hero", label: "Hero" },
  { kind: "rich_text", label: "Rich text" },
  { kind: "image_gallery", label: "Gallery" },
  { kind: "cta", label: "Call to action" },
  { kind: "faq", label: "FAQ" },
  { kind: "video", label: "Video" },
  { kind: "statistics", label: "Statistics" },
  { kind: "contact", label: "Contact" },
  { kind: "map", label: "Map" },
];

interface BlockDraft {
  id?: string;
  kind: CmsBlockKind;
  data: Record<string, unknown>;
}

function PageEditor() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCmsPage);
  const saveFn = useServerFn(upsertCmsPage);
  const publishFn = useServerFn(publishCmsPage);
  const saveBlocksFn = useServerFn(saveCmsBlocks);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.cms.page", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [meta, setMeta] = useState({ title: "", slug: "", description: "", route_path: "" });
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);

  useEffect(() => {
    if (!data?.page) return;
    setMeta({
      title: data.page.title ?? "",
      slug: data.page.slug ?? "",
      description: data.page.description ?? "",
      route_path: data.page.route_path ?? "",
    });
    setBlocks(
      (data.blocks ?? []).map((b) => ({
        id: b.id,
        kind: b.kind as CmsBlockKind,
        data: (b.data as Record<string, unknown>) ?? {},
      })),
    );
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await saveFn({ data: { id, ...meta } });
      await saveBlocksFn({
        data: {
          pageId: id,
          blocks: blocks.map((b, i) => ({ page_id: id, kind: b.kind, position: i, data: b.data })),
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.cms.page", id] });
      toast.success("Saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const publishMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return publishFn({ data: { id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.cms.page", id] });
      toast.success("Published");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data?.page) return <LoadingState />;

  const addBlock = (kind: CmsBlockKind) => setBlocks((bs) => [...bs, { kind, data: {} }]);
  const removeBlock = (i: number) => setBlocks((bs) => bs.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    setBlocks((bs) => {
      const next = [...bs];
      const j = i + dir;
      if (j < 0 || j >= next.length) return bs;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const updateBlock = (i: number, patch: Record<string, unknown>) =>
    setBlocks((bs) => bs.map((b, idx) => (idx === i ? { ...b, data: { ...b.data, ...patch } } : b)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={meta.title || "Untitled page"}
        description={`/${meta.slug}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip tone={statusTone[data.page.status] ?? "neutral"}>{data.page.status}</StatusChip>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/content/pages"><ArrowLeft className="mr-1 h-4 w-4" /> Back</Link>
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

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
        <aside className="rounded-lg border border-border bg-card p-4 space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Add block</h3>
          {BLOCK_TYPES.map((b) => (
            <Button key={b.kind} variant="ghost" size="sm" className="w-full justify-start" onClick={() => addBlock(b.kind)}>
              <Plus className="mr-1 h-3 w-3" /> {b.label}
            </Button>
          ))}
        </aside>

        <div className="space-y-3">
          {blocks.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
              No blocks yet — add one from the palette on the left.
            </div>
          )}
          {blocks.map((b, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{b.kind}</span>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => moveBlock(i, -1)}><ArrowUp className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => moveBlock(i, 1)}><ArrowDown className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => removeBlock(i)}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <BlockInspector kind={b.kind} data={b.data} onChange={(patch) => updateBlock(i, patch)} />
            </div>
          ))}
        </div>

        <aside className="rounded-lg border border-border bg-card p-4 space-y-3">
          <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Page metadata</h3>
          <label className="block text-xs">Title
            <Input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
          </label>
          <label className="block text-xs">Slug
            <Input value={meta.slug} onChange={(e) => setMeta((m) => ({ ...m, slug: e.target.value }))} />
          </label>
          <label className="block text-xs">Route path
            <Input value={meta.route_path} placeholder="/my-page" onChange={(e) => setMeta((m) => ({ ...m, route_path: e.target.value }))} />
          </label>
          <label className="block text-xs">Description
            <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} />
          </label>
        </aside>
      </div>
    </div>
  );
}

function BlockInspector({
  kind,
  data,
  onChange,
}: {
  kind: CmsBlockKind;
  data: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>) => void;
}) {
  const str = (k: string) => (data[k] as string) ?? "";
  switch (kind) {
    case "hero":
      return (
        <div className="space-y-2">
          <Input placeholder="Eyebrow" value={str("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} />
          <Input placeholder="Heading" value={str("heading")} onChange={(e) => onChange({ heading: e.target.value })} />
          <Textarea rows={2} placeholder="Subheading" value={str("subheading")} onChange={(e) => onChange({ subheading: e.target.value })} />
          <Input placeholder="Image URL" value={str("image")} onChange={(e) => onChange({ image: e.target.value })} />
        </div>
      );
    case "rich_text":
      return (
        <Textarea rows={6} placeholder="Rich text (HTML)" value={str("html")} onChange={(e) => onChange({ html: e.target.value })} />
      );
    case "cta":
      return (
        <div className="space-y-2">
          <Input placeholder="Heading" value={str("heading")} onChange={(e) => onChange({ heading: e.target.value })} />
          <Input placeholder="Button label" value={str("label")} onChange={(e) => onChange({ label: e.target.value })} />
          <Input placeholder="Button URL" value={str("url")} onChange={(e) => onChange({ url: e.target.value })} />
        </div>
      );
    case "video":
      return <Input placeholder="Video URL" value={str("url")} onChange={(e) => onChange({ url: e.target.value })} />;
    case "map":
      return <Input placeholder="Map embed URL" value={str("url")} onChange={(e) => onChange({ url: e.target.value })} />;
    default:
      return (
        <Textarea
          rows={4}
          placeholder="JSON data"
          value={JSON.stringify(data, null, 2)}
          onChange={(e) => {
            try { onChange(JSON.parse(e.target.value)); } catch { /* ignore */ }
          }}
        />
      );
  }
}