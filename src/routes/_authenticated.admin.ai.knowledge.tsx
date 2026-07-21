import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { BookOpen, FileText, Loader2, Plus, Search, Trash2, Upload, Download } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  deleteKbDocument,
  getKbDocument,
  getKbDocumentFileUrl,
  listKbCategories,
  listKbDocuments,
  searchKnowledge,
  upsertKbDocument,
  type KbDocument,
} from "@/domains/ai/knowledge.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge")({
  head: () => ({ meta: [{ title: "AI Knowledge Base — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: KnowledgeAdmin,
});

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const ROLE_OPTIONS = ["owner", "manager", "reception", "finance", "marketing", "housekeeping", "editor"] as const;

function KnowledgeAdmin() {
  const listDocsFn = useServerFn(listKbDocuments);
  const listCatsFn = useServerFn(listKbCategories);
  const searchFn = useServerFn(searchKnowledge);
  const deleteFn = useServerFn(deleteKbDocument);
  const qc = useQueryClient();

  const [categoryId, setCategoryId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [testQuery, setTestQuery] = useState("");
  const [editing, setEditing] = useState<KbDocument | null | "new">(null);

  const categories = useQuery({ queryKey: ["kb.categories"], queryFn: () => listCatsFn() });
  const docs = useQuery({
    queryKey: ["kb.documents", categoryId, statusFilter, search],
    queryFn: () => listDocsFn({ data: {
      category_id: categoryId || undefined,
      status: statusFilter || undefined,
      search: search || undefined,
    } }),
  });

  const testSearch = useMutation({
    mutationFn: (q: string) => searchFn({ data: { query: q, limit: 6 } }),
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["kb.documents"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI Knowledge Base"
        description="SOPs, policies and brand reference material that Mtoni AI cites when answering questions."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 size-4" /> New document
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <SectionCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search titles…" className="pl-8" />
            </div>
            <Select value={categoryId || "all"} onValueChange={(v) => setCategoryId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {docs.isLoading ? (
            <LoadingState />
          ) : !docs.data || docs.data.length === 0 ? (
            <EmptyState icon={BookOpen} title="No documents yet" description="Upload SOPs, policies or brand guidelines so Mtoni AI can cite them." />
          ) : (
            <div className="divide-y">
              {docs.data.map((d) => (
                <div key={d.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                  <div className="min-w-0 flex-1">
                    <button className="text-left font-medium hover:underline" onClick={() => setEditing(d)}>
                      {d.title}
                    </button>
                    {d.summary && <div className="text-sm text-muted-foreground line-clamp-2">{d.summary}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                      <Badge variant={d.status === "published" ? "default" : "secondary"}>{d.status}</Badge>
                      {d.category_slug && <Badge variant="outline">{d.category_slug}</Badge>}
                      <Badge variant="outline">{d.source_type}</Badge>
                      <Badge variant="outline">v{d.current_version}</Badge>
                      {(d.tags ?? []).slice(0, 4).map((t) => <Badge key={t} variant="outline">#{t}</Badge>)}
                      {(d.allowed_roles ?? []).length > 0 && (
                        <Badge variant="outline">roles: {(d.allowed_roles ?? []).join(",")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(d)}>Edit</Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { if (confirm(`Delete "${d.title}"?`)) del.mutate(d.id); }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-3">
          <SectionCard title="Test retrieval">
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <Input
                  value={testQuery}
                  onChange={(e) => setTestQuery(e.target.value)}
                  placeholder="e.g. late airport transfer"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (testQuery.trim()) testSearch.mutate(testQuery.trim()); } }}
                />
                <Button size="sm" disabled={!testQuery.trim() || testSearch.isPending} onClick={() => testSearch.mutate(testQuery.trim())}>
                  {testSearch.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                </Button>
              </div>
              {testSearch.data && (
                <div className="space-y-2">
                  {testSearch.data.length === 0 ? (
                    <div className="text-muted-foreground text-xs">No matches.</div>
                  ) : testSearch.data.map((r) => (
                    <div key={r.chunk_id} className="rounded border bg-card p-2 text-xs">
                      <div className="font-medium">{r.document_title}</div>
                      <div className="text-muted-foreground line-clamp-3">{r.content}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
          <SectionCard title="Categories">
            <div className="flex flex-wrap gap-1 text-xs">
              {(categories.data ?? []).map((c) => (
                <Badge key={c.id} variant="outline">{c.name}</Badge>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>

      {editing !== null && (
        <DocumentDialog
          value={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["kb.documents"] }); }}
          categories={categories.data ?? []}
        />
      )}
    </div>
  );
}

function DocumentDialog({
  value,
  onClose,
  onSaved,
  categories,
}: {
  value: KbDocument | "new";
  onClose: () => void;
  onSaved: () => void;
  categories: { id: string; name: string }[];
}) {
  const isNew = value === "new";
  const initial = isNew ? null : (value as KbDocument);
  const getFn = useServerFn(getKbDocument);
  const saveFn = useServerFn(upsertKbDocument);
  const fileUrlFn = useServerFn(getKbDocumentFileUrl);

  const detail = useQuery({
    queryKey: ["kb.doc", initial?.id],
    queryFn: () => getFn({ data: { id: initial!.id } }),
    enabled: !isNew,
  });

  const [title, setTitle] = useState(initial?.title ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [status, setStatus] = useState<string>(initial?.status ?? "draft");
  const [sourceType, setSourceType] = useState<string>(initial?.source_type ?? "markdown");
  const [tags, setTags] = useState<string>((initial?.tags ?? []).join(", "));
  const [allowedRoles, setAllowedRoles] = useState<string[]>(initial?.allowed_roles ?? []);
  const [content, setContent] = useState<string>("");
  const [contentDirty, setContentDirty] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [storagePath, setStoragePath] = useState<string | null>(initial?.storage_path ?? null);

  useMemo(() => {
    if (detail.data?.content && !contentDirty) setContent(detail.data.content);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data?.content]);

  const save = useMutation({
    mutationFn: async () => {
      return saveFn({ data: {
        id: isNew ? undefined : initial!.id,
        title,
        summary: summary || null,
        category_id: categoryId || null,
        status: status as any,
        source_type: sourceType as any,
        storage_path: storagePath,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        allowed_roles: allowedRoles.length ? allowedRoles : null,
        content_text: contentDirty || isNew ? content : null,
        change_note: changeNote || null,
      } });
    },
    onSuccess: () => { toast.success("Saved"); onSaved(); },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
      const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("knowledge-docs").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      setStoragePath(path);

      // Extract text for supported types
      const isText = /^(text\/|application\/(json|xml|x-yaml))/.test(file.type) || /\.(md|markdown|txt|csv|log)$/i.test(file.name);
      if (isText) {
        const text = await file.text();
        setContent(text);
        setContentDirty(true);
        setSourceType(/\.(md|markdown)$/i.test(file.name) ? "markdown" : "text");
      } else if (/\.pdf$/i.test(file.name)) {
        setSourceType("pdf");
        toast("File uploaded", { description: "PDF stored. Paste extracted text below so Mtoni AI can index it." });
      } else if (/\.docx$/i.test(file.name)) {
        setSourceType("docx");
        toast("File uploaded", { description: "DOCX stored. Paste extracted text below so Mtoni AI can index it." });
      }
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function downloadFile() {
    if (!initial?.id) return;
    const { url } = await fileUrlFn({ data: { id: initial.id } });
    if (url) window.open(url, "_blank");
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "New knowledge document" : "Edit document"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <label className="text-sm font-medium">Title</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Front Desk SOP — Check-in" />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Summary</label>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} placeholder="One-line description used in AI citations." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Category</label>
              <Select value={categoryId || "none"} onValueChange={(v) => setCategoryId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Uncategorised" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorised</SelectItem>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Tags (comma-separated)</label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="check-in, sop, front-desk" />
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Allowed roles (empty = all staff)</label>
            <div className="flex flex-wrap gap-1 rounded-md border p-2">
              {ROLE_OPTIONS.map((r) => {
                const active = allowedRoles.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAllowedRoles((prev) => active ? prev.filter((x) => x !== r) : [...prev, r])}
                    className={`rounded px-2 py-0.5 text-xs border ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"}`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Source file (optional)</label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted cursor-pointer">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Upload file
                <input
                  type="file"
                  className="hidden"
                  accept=".txt,.md,.markdown,.pdf,.docx,.csv,.log,.json"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                />
              </label>
              {storagePath && <Badge variant="outline">{storagePath.split("/").pop()}</Badge>}
              {!isNew && initial?.storage_path && (
                <Button variant="ghost" size="sm" onClick={downloadFile}><Download className="size-4 mr-1" /> Download</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Text/Markdown files auto-extract. For PDF/DOCX, paste the extracted text below so Mtoni AI can index it.</p>
          </div>

          <div className="grid gap-2">
            <label className="text-sm font-medium">Content (indexed & searchable)</label>
            <Textarea
              value={content}
              onChange={(e) => { setContent(e.target.value); setContentDirty(true); }}
              rows={12}
              placeholder="Paste or write the reference content here. Every save rebuilds the search index."
              className="font-mono text-xs"
            />
            <div className="text-xs text-muted-foreground">{content.length.toLocaleString()} characters</div>
          </div>

          {!isNew && contentDirty && (
            <div className="grid gap-2">
              <label className="text-sm font-medium">Change note (version comment)</label>
              <Input value={changeNote} onChange={(e) => setChangeNote(e.target.value)} placeholder="What changed in this version?" />
            </div>
          )}

          {!isNew && detail.data?.versions && detail.data.versions.length > 0 && (
            <SectionCard title="Version history">
              <div className="divide-y text-xs">
                {(detail.data.versions as any[]).map((v) => (
                  <div key={v.id} className="flex items-center justify-between py-1.5">
                    <div>
                      <Badge variant="outline" className="mr-2">v{v.version}</Badge>
                      {v.change_note ?? <span className="text-muted-foreground">no note</span>}
                    </div>
                    <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <FileText className="size-4 mr-1.5" />}
            Save {contentDirty && !isNew ? "as new version" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}