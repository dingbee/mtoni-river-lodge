import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Save, Send, Monitor, Tablet, Smartphone, Eye, Archive, RotateCcw, CalendarClock, History } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { LoadingState } from "@/components/os/LoadingState";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getCmsPage,
  upsertCmsPage,
  publishCmsPage,
  saveCmsBlocks,
  scheduleCmsPage,
  archiveCmsPage,
  restoreCmsPage,
  snapshotCmsPage,
  restoreCmsPageVersion,
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
  const scheduleFn = useServerFn(scheduleCmsPage);
  const archiveFn = useServerFn(archiveCmsPage);
  const restoreFn = useServerFn(restoreCmsPage);
  const snapshotFn = useServerFn(snapshotCmsPage);
  const restoreVersionFn = useServerFn(restoreCmsPageVersion);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["admin.cms.page", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const [meta, setMeta] = useState({ title: "", slug: "", description: "", route_path: "" });
  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("desktop");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);

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
      await snapshotFn({ data: { id, note: "Auto-snapshot on publish" } });
      return publishFn({ data: { id } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.cms.page", id] });
      toast.success("Published");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const scheduleMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return scheduleFn({ data: { id, scheduled_at: new Date(scheduleAt).toISOString() } });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin.cms.page", id] });
      setScheduleOpen(false);
      toast.success("Scheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: () => archiveFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin.cms.page", id] }); toast.success("Archived"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreMut = useMutation({
    mutationFn: () => restoreFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin.cms.page", id] }); toast.success("Restored to draft"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const snapshotMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync();
      return snapshotFn({ data: { id, note: "Manual snapshot" } });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["admin.cms.page", id] }); toast.success(`Snapshot v${r.version} saved`); },
    onError: (e: Error) => toast.error(e.message),
  });
  const restoreVersionMut = useMutation({
    mutationFn: (versionId: string) => restoreVersionFn({ data: { versionId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin.cms.page", id] }); setVersionsOpen(false); toast.success("Version restored"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data?.page) return <LoadingState />;
  const isArchived = data.page.status === "archived";

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
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/content/pages/$id/preview" params={{ id }}><Eye className="mr-1 h-4 w-4" /> Preview</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setVersionsOpen(true)}>
              <History className="mr-1 h-4 w-4" /> Versions
            </Button>
            <Button variant="ghost" size="sm" onClick={() => snapshotMut.mutate()} disabled={snapshotMut.isPending}>
              Snapshot
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setScheduleOpen(true)}>
              <CalendarClock className="mr-1 h-4 w-4" /> Schedule
            </Button>
            {isArchived ? (
              <Button variant="ghost" size="sm" onClick={() => restoreMut.mutate()} disabled={restoreMut.isPending}>
                <RotateCcw className="mr-1 h-4 w-4" /> Restore
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => { if (confirm("Archive this page?")) archiveMut.mutate(); }} disabled={archiveMut.isPending}>
                <Archive className="mr-1 h-4 w-4" /> Archive
              </Button>
            )}
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

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule publish</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground">Publish at</label>
            <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
            <p className="text-xs text-muted-foreground">The page stays in <em>scheduled</em> until you publish it.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button onClick={() => scheduleMut.mutate()} disabled={!scheduleAt || scheduleMut.isPending}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={versionsOpen} onOpenChange={setVersionsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Version history</DialogTitle></DialogHeader>
          <div className="max-h-[420px] space-y-1 overflow-y-auto">
            {(data.versions ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No snapshots yet. Use <em>Snapshot</em> or publish to create one.</p>
            ) : (
              (data.versions ?? []).map((v) => (
                <div key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">v{v.version}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleString()} {v.note ? `· ${v.note}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => { if (confirm(`Restore v${v.version}? Current blocks will be replaced.`)) restoreVersionMut.mutate(v.id); }} disabled={restoreVersionMut.isPending}>
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