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
import {
  listJournalArticles,
  createJournalArticle,
  deleteJournalArticle,
} from "@/domains/content/journal/journal.functions";

export const Route = createFileRoute("/_authenticated/admin/content/journal/")({
  head: () => ({ meta: [{ title: "Journal — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: JournalListPage,
});

const statusTone: Record<string, StatusTone> = {
  draft: "neutral",
  scheduled: "info",
  published: "success",
  archived: "warning",
};

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function JournalListPage() {
  const listFn = useServerFn(listJournalArticles);
  const createFn = useServerFn(createJournalArticle);
  const deleteFn = useServerFn(deleteJournalArticle);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin.journal.list"],
    queryFn: () => listFn({}),
  });

  const createMut = useMutation({
    mutationFn: async () => createFn({ data: { title, slug: slug || slugify(title) } }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ["admin.journal.list"] });
      setOpen(false);
      setTitle("");
      setSlug("");
      if (row?.id) navigate({ to: "/admin/content/journal/$id", params: { id: row.id } });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin.journal.list"] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal"
        description="Draft, schedule and publish articles for the Mtoni journal."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" /> New article</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New journal article</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Title</label>
                  <Input value={title} onChange={(e) => { setTitle(e.target.value); if (!slug) setSlug(slugify(e.target.value)); }} />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">Slug</label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
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
        <EmptyState title="No articles yet" description="Create your first journal article to get started." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Title</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Published</th>
                <th className="px-4 py-3 text-left">Updated</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link to="/admin/content/journal/$id" params={{ id: a.id }} className="font-medium hover:underline">
                      {a.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">/{a.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip tone={statusTone[a.status] ?? "neutral"}>{a.status}</StatusChip>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {a.published_at ? new Date(a.published_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(a.updated_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { if (confirm("Delete this article?")) deleteMut.mutate(a.id); }}
                    >
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
