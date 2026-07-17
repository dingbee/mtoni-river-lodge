import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Upload, FolderPlus, Folder, Trash2, Search, Pencil, Copy, Loader2, Image as ImageIcon, X,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { processImage, sha256Hex } from "@/lib/image-processing";
import {
  listMediaFolders, createMediaFolder, renameMediaFolder, deleteMediaFolder,
  listMediaAssets, createMediaAsset, updateMediaAsset, deleteMediaAsset,
  findDuplicateByHash, bulkRenameMediaAssets, getMediaUsage, signMediaUrl,
} from "@/domains/content/media/media.functions";

export const Route = createFileRoute("/_authenticated/admin/content/media")({
  head: () => ({ meta: [{ title: "Media Library — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: MediaLibrary,
});

type Asset = {
  id: string; filename: string; url: string; alt_text: string | null; caption: string | null;
  content_hash: string | null; mime_type: string | null; size_bytes: number | null;
  width: number | null; height: number | null; folder_id: string | null; tags: string[] | null;
  created_at: string;
};
type Folder = { id: string; name: string; parent_id: string | null; path: string };

function formatBytes(n: number | null | undefined) {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function MediaLibrary() {
  const qc = useQueryClient();
  const listFoldersFn = useServerFn(listMediaFolders);
  const listAssetsFn = useServerFn(listMediaAssets);
  const createFolderFn = useServerFn(createMediaFolder);
  const renameFolderFn = useServerFn(renameMediaFolder);
  const deleteFolderFn = useServerFn(deleteMediaFolder);
  const createAssetFn = useServerFn(createMediaAsset);
  const updateAssetFn = useServerFn(updateMediaAsset);
  const deleteAssetFn = useServerFn(deleteMediaAsset);
  const dupCheckFn = useServerFn(findDuplicateByHash);
  const bulkRenameFn = useServerFn(bulkRenameMediaAssets);
  const usageFn = useServerFn(getMediaUsage);
  const signFn = useServerFn(signMediaUrl);

  const [folderId, setFolderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [activeAsset, setActiveAsset] = useState<Asset | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [renameOpen, setRenameOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [bulkRename, setBulkRename] = useState({ prefix: "", suffix: "", from: "", to: "" });
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const foldersQ = useQuery({ queryKey: ["admin.media.folders"], queryFn: () => listFoldersFn() });
  const assetsQ = useQuery({
    queryKey: ["admin.media.assets", folderId, search],
    queryFn: () => listAssetsFn({ data: { folderId, search } }),
  });

  const folders = (foldersQ.data ?? []) as Folder[];
  const assets = (assetsQ.data ?? []) as Asset[];

  // Resolve signed URLs for previews (private bucket).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const missing = assets.filter((a) => a.url.startsWith("media/") && !signedUrls[a.id]);
      if (!missing.length) return;
      const entries: [string, string][] = [];
      for (const a of missing) {
        try {
          const signed = await signFn({ data: { path: a.url.replace(/^media\//, ""), expiresIn: 3600 } });
          if (signed?.signedUrl) entries.push([a.id, signed.signedUrl]);
        } catch { /* ignore */ }
      }
      if (!cancelled && entries.length) setSignedUrls((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    })();
    return () => { cancelled = true; };
  }, [assets, signedUrls, signFn]);

  const previewUrl = (a: Asset) =>
    a.url.startsWith("http") ? a.url : signedUrls[a.id] ?? "";

  const invalidateAssets = () => qc.invalidateQueries({ queryKey: ["admin.media.assets"] });

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading({ done: 0, total: list.length });
    let done = 0;
    for (const file of list) {
      try {
        const processed = await processImage(file, { maxWidth: 2400, quality: 0.82, toWebp: file.type.startsWith("image/") });
        const hash = await sha256Hex(processed.blob);
        const dup = await dupCheckFn({ data: { hash } });
        if (dup) {
          toast.info(`Skipped duplicate: ${file.name} (matches ${dup.filename})`);
          done++; setUploading({ done, total: list.length }); continue;
        }
        const key = `${folderId ?? "root"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${processed.filename}`;
        const { error: upErr } = await supabase.storage.from("media").upload(key, processed.blob, {
          cacheControl: "3600", upsert: false, contentType: processed.mime,
        });
        if (upErr) throw upErr;
        await createAssetFn({
          data: {
            filename: processed.filename,
            url: `media/${key}`,
            content_hash: hash,
            mime_type: processed.mime,
            size_bytes: processed.size,
            width: processed.width || null,
            height: processed.height || null,
            folder_id: folderId,
          },
        });
      } catch (e) {
        toast.error(`Upload failed for ${file.name}: ${(e as Error).message}`);
      }
      done++; setUploading({ done, total: list.length });
    }
    setUploading(null);
    invalidateAssets();
    toast.success(`${done} file${done === 1 ? "" : "s"} processed`);
  }

  const createFolder = useMutation({
    mutationFn: (name: string) => createFolderFn({ data: { name, parentId: folderId } }),
    onSuccess: () => { toast.success("Folder created"); qc.invalidateQueries({ queryKey: ["admin.media.folders"] }); setNewFolderOpen(false); setNewFolderName(""); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const removeFolder = useMutation({
    mutationFn: (id: string) => deleteFolderFn({ data: { id } }),
    onSuccess: () => { toast.success("Folder deleted"); qc.invalidateQueries({ queryKey: ["admin.media.folders"] }); if (folderId) setFolderId(null); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const renameFolder = useMutation({
    mutationFn: (input: { id: string; name: string }) => renameFolderFn({ data: input }),
    onSuccess: () => { toast.success("Folder renamed"); qc.invalidateQueries({ queryKey: ["admin.media.folders"] }); },
  });

  const removeAsset = useMutation({
    mutationFn: (a: Asset) => deleteAssetFn({ data: { id: a.id, storagePath: a.url.startsWith("media/") ? a.url.replace(/^media\//, "") : null } }),
    onSuccess: () => { toast.success("Asset deleted"); invalidateAssets(); setActiveAsset(null); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });

  const saveAsset = useMutation({
    mutationFn: (input: { id: string; patch: Partial<Asset> }) => updateAssetFn({ data: input }),
    onSuccess: () => { toast.success("Saved"); invalidateAssets(); },
  });

  const doBulkRename = useMutation({
    mutationFn: () => bulkRenameFn({ data: {
      ids: Array.from(selection),
      prefix: bulkRename.prefix || undefined,
      suffix: bulkRename.suffix || undefined,
      replace: bulkRename.from ? { from: bulkRename.from, to: bulkRename.to } : undefined,
    } }),
    onSuccess: (r) => { toast.success(`Renamed ${r.count} asset(s)`); setRenameOpen(false); setBulkRename({ prefix: "", suffix: "", from: "", to: "" }); invalidateAssets(); },
  });

  const toggle = (id: string) => setSelection((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const stats = useMemo(() => {
    const total = assets.length;
    const size = assets.reduce((s, a) => s + (a.size_bytes ?? 0), 0);
    return { total, size };
  }, [assets]);

  const usageQ = useQuery({
    queryKey: ["admin.media.usage", activeAsset?.id],
    queryFn: () => activeAsset ? usageFn({ data: { assetId: activeAsset.id } }) : Promise.resolve([]),
    enabled: !!activeAsset,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Media Library" description="Central image and file library. Uploads are compressed and converted to WebP automatically." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Assets in view" value={String(stats.total)} />
        <StatCard label="Total size" value={formatBytes(stats.size)} />
        <StatCard label="Folders" value={String(folders.length)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <SectionCard
          title="Folders"
          actions={<Button size="sm" variant="outline" onClick={() => setNewFolderOpen(true)}><FolderPlus className="h-4 w-4 mr-1" />New</Button>}
        >
          <ul className="space-y-1">
            <li>
              <button className={`w-full text-left px-3 py-2 rounded-md text-sm ${folderId === null ? "bg-accent" : "hover:bg-accent/50"}`} onClick={() => setFolderId(null)}>
                <Folder className="h-3.5 w-3.5 inline mr-2" />All / uncategorised
              </button>
            </li>
            {folders.map((f) => (
              <li key={f.id} className="group flex items-center gap-1">
                <button
                  className={`flex-1 text-left px-3 py-2 rounded-md text-sm truncate ${folderId === f.id ? "bg-accent" : "hover:bg-accent/50"}`}
                  onClick={() => setFolderId(f.id)}
                >
                  <Folder className="h-3.5 w-3.5 inline mr-2" />{f.name}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1"
                  onClick={() => {
                    const name = prompt("Rename folder", f.name);
                    if (name && name.trim()) renameFolder.mutate({ id: f.id, name: name.trim() });
                  }}
                  title="Rename"
                ><Pencil className="h-3 w-3" /></button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-1"
                  onClick={() => { if (confirm(`Delete folder "${f.name}"?`)) removeFolder.mutate(f.id); }}
                  title="Delete"
                ><Trash2 className="h-3 w-3" /></button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard
            title="Assets"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                  <Input className="pl-7 h-8 w-48" placeholder="Search filename / alt" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                {selection.size > 0 && (
                  <>
                    <Badge variant="secondary">{selection.size} selected</Badge>
                    <Button size="sm" variant="outline" onClick={() => setRenameOpen(true)}><Pencil className="h-4 w-4 mr-1" />Bulk rename</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelection(new Set())}><X className="h-4 w-4" /></Button>
                  </>
                )}
                <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={!!uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                  {uploading ? `Uploading ${uploading.done}/${uploading.total}` : "Upload"}
                </Button>
              </div>
            }
          >
            {assetsQ.isLoading ? (
              <LoadingState />
            ) : assets.length === 0 ? (
              <div className="text-sm text-muted-foreground p-8 text-center border border-dashed rounded-md">
                <ImageIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No assets in this folder. Drop or upload to get started.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3">
                {assets.map((a) => {
                  const sel = selection.has(a.id);
                  const src = previewUrl(a);
                  return (
                    <div key={a.id} className={`group relative border rounded-md overflow-hidden cursor-pointer ${sel ? "ring-2 ring-primary" : ""}`}>
                      <button className="absolute top-1 left-1 z-10 bg-background/80 rounded p-0.5" onClick={(e) => { e.stopPropagation(); toggle(a.id); }}>
                        <Checkbox checked={sel} />
                      </button>
                      <div className="aspect-square bg-muted flex items-center justify-center" onClick={() => setActiveAsset(a)}>
                        {src ? <img src={src} alt={a.alt_text ?? a.filename} className="w-full h-full object-cover" loading="lazy" />
                          : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
                      </div>
                      <div className="p-2 text-xs">
                        <div className="truncate font-medium">{a.filename}</div>
                        <div className="text-muted-foreground">{formatBytes(a.size_bytes)}{a.width ? ` · ${a.width}×${a.height}` : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Asset detail dialog */}
      <Dialog open={!!activeAsset} onOpenChange={(o) => !o && setActiveAsset(null)}>
        <DialogContent className="max-w-2xl">
          {activeAsset && (
            <>
              <DialogHeader>
                <DialogTitle className="truncate">{activeAsset.filename}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="aspect-square bg-muted rounded overflow-hidden flex items-center justify-center">
                  {previewUrl(activeAsset) ? <img src={previewUrl(activeAsset)} alt={activeAsset.alt_text ?? activeAsset.filename} className="w-full h-full object-contain" /> : <ImageIcon className="h-10 w-10 text-muted-foreground" />}
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Filename</Label>
                    <Input defaultValue={activeAsset.filename} onBlur={(e) => e.target.value !== activeAsset.filename && saveAsset.mutate({ id: activeAsset.id, patch: { filename: e.target.value } })} />
                  </div>
                  <div>
                    <Label>Alt text</Label>
                    <Textarea rows={2} defaultValue={activeAsset.alt_text ?? ""} onBlur={(e) => saveAsset.mutate({ id: activeAsset.id, patch: { alt_text: e.target.value } })} />
                  </div>
                  <div>
                    <Label>Caption</Label>
                    <Input defaultValue={activeAsset.caption ?? ""} onBlur={(e) => saveAsset.mutate({ id: activeAsset.id, patch: { caption: e.target.value } })} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <div>{activeAsset.mime_type} · {formatBytes(activeAsset.size_bytes)}{activeAsset.width ? ` · ${activeAsset.width}×${activeAsset.height}` : ""}</div>
                    <div className="font-mono text-[10px] truncate">{activeAsset.content_hash}</div>
                  </div>
                  <div>
                    <Label>Usage</Label>
                    <div className="text-sm border rounded p-2 max-h-32 overflow-auto">
                      {usageQ.isLoading ? "…" : (usageQ.data ?? []).length === 0
                        ? <span className="text-muted-foreground">Not currently used.</span>
                        : <ul className="space-y-1">{(usageQ.data ?? []).map((u) => <li key={u.id} className="text-xs"><Badge variant="outline">{u.used_in_type}</Badge> {u.used_in_id}{u.field ? ` · ${u.field}` : ""}</li>)}</ul>
                      }
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => navigator.clipboard.writeText(previewUrl(activeAsset))}><Copy className="h-4 w-4 mr-1" />Copy URL</Button>
                <Button
                  variant="destructive"
                  onClick={() => { if (confirm("Delete this asset?")) removeAsset.mutate(activeAsset); }}
                  disabled={(usageQ.data ?? []).length > 0}
                  title={(usageQ.data ?? []).length > 0 ? "Asset is in use" : ""}
                ><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* New folder dialog */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New folder</DialogTitle></DialogHeader>
          <Input placeholder="Folder name" value={newFolderName} onChange={(e) => setNewFolderName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
            <Button onClick={() => newFolderName.trim() && createFolder.mutate(newFolderName.trim())} disabled={createFolder.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk rename dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Bulk rename {selection.size} asset(s)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Prepend prefix</Label><Input value={bulkRename.prefix} onChange={(e) => setBulkRename((s) => ({ ...s, prefix: e.target.value }))} placeholder="e.g. hero-" /></div>
            <div><Label>Append suffix (before extension)</Label><Input value={bulkRename.suffix} onChange={(e) => setBulkRename((s) => ({ ...s, suffix: e.target.value }))} placeholder="e.g. -v2" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Find</Label><Input value={bulkRename.from} onChange={(e) => setBulkRename((s) => ({ ...s, from: e.target.value }))} /></div>
              <div><Label>Replace</Label><Input value={bulkRename.to} onChange={(e) => setBulkRename((s) => ({ ...s, to: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={() => doBulkRename.mutate()} disabled={doBulkRename.isPending}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
