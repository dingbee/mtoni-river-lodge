import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";
import { LoadingState } from "@/components/os/LoadingState";
import { EmptyState } from "@/components/os/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { listCmsPages, createCmsPage, deleteCmsPage } from "@/domains/content/pages/pages.functions";

export const Route = createFileRoute("/_authenticated/admin/content/pages/")({
  head: () => ({ meta: [{ title: "Pages — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PagesListPage,
});

const statusTone: Record<string, StatusTone> = {
  draft: "neutral", review: "info", scheduled: "info", published: "success", archived: "warning",
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function PagesListPage() {
  const listFn = useServerFn(listCmsPages);
  const createFn = useServerFn(createCmsPage);
  const deleteFn = useServerFn(deleteCmsPage);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [routePath, setRoutePath] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin.cms.pages"],
    queryFn: () => listFn({}),
  });

  const createMut = useMutation({
    mutationFn: () => createFn({ data: { title, slug: slug || slugify(title), route_path: routePath || undefined } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["admin.cms.pages"] });
      setOpen(false); setTitle(""); setSlug(""); setRoutePath("");
      if (row?.id) navigate({ to: "/admin/content/pages/$id", params: { id: row.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin.cms.pages"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pages"
        description="Draft, review, publish, schedule and archive website pages."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> New page</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New page</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Title</label>
                  <Input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Slug</label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Route path (optional)</label>
                  <Input value={routePath} placeholder="/my-page" onChange={(e) => setRoutePath(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createMut.mutate()} disabled={!title || createMut.isPending}>Create draft</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {isLoading ? (
        <LoadingState />
      ) : !data || data.length === 0 ? (
        <EmptyState title="No pages yet" description="Create a page to start building content blocks." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Route</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link to="/admin/content/pages/$id" params={{ id: p.id }} className="font-medium hover:underline">{p.title}</Link>
                    <div className="text-xs text-muted-foreground">/{p.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{p.route_path ?? "—"}</td>
                  <td className="px-4 py-3"><StatusChip tone={statusTone[p.status] ?? "neutral"}>{p.status}</StatusChip></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(p.updated_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => { if (confirm("Delete this page?")) deleteMut.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}