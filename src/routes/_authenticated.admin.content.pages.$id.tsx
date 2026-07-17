import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Send, Monitor, Tablet, Smartphone } from "lucide-react";
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
} from "@/domains/content/pages/pages.functions";
import { BLOCK_REGISTRY, type CmsBlockKind } from "@/domains/content/pages/blocks";
import { BlockPalette } from "@/components/os/content/BlockPalette";
import { BlockCanvas } from "@/components/os/content/BlockCanvas";
import { BlockInspector } from "@/components/os/content/BlockInspector";
import type { BlockDraft } from "@/components/os/content/types";

export const Route = createFileRoute("/_authenticated/admin/content/pages/$id")({
  head: () => ({ meta: [{ title: "Edit Page — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PageEditor,
});

const statusTone: Record<string, StatusTone> = {
  draft: "neutral", review: "info", scheduled: "info", published: "success", archived: "warning",
};

const PREVIEW_WIDTHS = { desktop: 1200, tablet: 820, mobile: 420 } as const;
type PreviewMode = keyof typeof PREVIEW_WIDTHS;

const makeUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");

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
        uid: makeUid(),
        id: b.id,
        kind: b.kind as CmsBlockKind,
        data: (b.data as Record<string, unknown>) ?? {},
      })),
    );
  }, [data]);

  const selectedBlock = useMemo(
    () => blocks.find((b) => b.uid === selectedId) ?? null,
    [blocks, selectedId],
  );

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

  const addBlock = (kind: CmsBlockKind) => {
    const next: BlockDraft = { uid: makeUid(), kind, data: BLOCK_REGISTRY[kind].defaults() };
    setBlocks((bs) => [...bs, next]);
    setSelectedId(next.uid);
  };
  const duplicateBlock = (u: string) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.uid === u);
      if (i < 0) return bs;
      const clone: BlockDraft = { ...bs[i], uid: makeUid(), id: undefined, data: { ...bs[i].data } };
      return [...bs.slice(0, i + 1), clone, ...bs.slice(i + 1)];
    });
  const removeBlock = (u: string) => {
    setBlocks((bs) => bs.filter((b) => b.uid !== u));
    setSelectedId((s) => (s === u ? null : s));
  };
  const updateBlockData = (u: string, patch: Record<string, unknown>) =>
    setBlocks((bs) => bs.map((b) => (b.uid === u ? { ...b, data: { ...b.data, ...patch } } : b)));

  return (
    <div className="space-y-6">
      <PageHeader
        title={meta.title || "Untitled page"}
        description={`/${meta.slug}`}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip tone={statusTone[data.page.status] ?? "neutral"}>{data.page.status}</StatusChip>
            <div className="hidden items-center gap-0.5 rounded-md border border-border p-0.5 md:flex">
              <PreviewToggle mode="desktop" current={previewMode} onSelect={setPreviewMode} icon={<Monitor className="h-3.5 w-3.5" />} />
              <PreviewToggle mode="tablet" current={previewMode} onSelect={setPreviewMode} icon={<Tablet className="h-3.5 w-3.5" />} />
              <PreviewToggle mode="mobile" current={previewMode} onSelect={setPreviewMode} icon={<Smartphone className="h-3.5 w-3.5" />} />
            </div>
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

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)_320px]">
        <BlockPalette onAdd={addBlock} />

        <BlockCanvas
          blocks={blocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={setBlocks}
          onDuplicate={duplicateBlock}
          onRemove={removeBlock}
          previewWidth={PREVIEW_WIDTHS[previewMode]}
        />

        <div className="space-y-4">
          <BlockInspector
            block={selectedBlock}
            onChange={(patch) => selectedBlock && updateBlockData(selectedBlock.uid, patch)}
          />
          <aside className="rounded-lg border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">Page metadata</h3>
            <label className="block space-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">Title
              <Input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} />
            </label>
            <label className="block space-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">Slug
              <Input value={meta.slug} onChange={(e) => setMeta((m) => ({ ...m, slug: e.target.value }))} />
            </label>
            <label className="block space-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">Route path
              <Input value={meta.route_path} placeholder="/my-page" onChange={(e) => setMeta((m) => ({ ...m, route_path: e.target.value }))} />
            </label>
            <label className="block space-y-1 text-[11px] uppercase tracking-wider text-muted-foreground">Description
              <Textarea rows={3} value={meta.description} onChange={(e) => setMeta((m) => ({ ...m, description: e.target.value }))} />
            </label>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PreviewToggle({
  mode, current, onSelect, icon,
}: { mode: PreviewMode; current: PreviewMode; onSelect: (m: PreviewMode) => void; icon: React.ReactNode }) {
  const active = mode === current;
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={`inline-flex h-7 w-7 items-center justify-center rounded ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
      aria-label={`${mode} preview`}
    >
      {icon}
    </button>
  );
}