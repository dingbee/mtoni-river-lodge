import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, Check, Archive, Trash2, FileText, Globe, BookOpen, Bed } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  listKnowledgeSources,
  setKnowledgeSourceStatus,
  deleteKnowledgeSource,
  syncJournalArticles,
  syncCmsPages,
  syncRoomsAndExperiences,
} from "@/domains/ai/knowledge-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge/sync")({
  head: () => ({
    meta: [{ title: "Knowledge Sync — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: KnowledgeSyncPage,
});

const TYPE_ICONS: Record<string, any> = {
  document: FileText,
  website_page: Globe,
  journal_article: BookOpen,
  room: Bed,
  experience: BookOpen,
  policy: FileText,
  other: FileText,
};

function KnowledgeSyncPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listKnowledgeSources);
  const setStatusFn = useServerFn(setKnowledgeSourceStatus);
  const delFn = useServerFn(deleteKnowledgeSource);
  const syncJournalFn = useServerFn(syncJournalArticles);
  const syncCmsFn = useServerFn(syncCmsPages);
  const syncRoomsFn = useServerFn(syncRoomsAndExperiences);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["ai-knowledge-sources", typeFilter, statusFilter, search],
    queryFn: () =>
      listFn({
        data: {
          source_type: typeFilter === "all" ? undefined : (typeFilter as any),
          status: statusFilter as any,
          search: search || undefined,
        },
      }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["ai-knowledge-sources"] });

  const syncJournal = useMutation({
    mutationFn: () => syncJournalFn(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.upserted} journal articles`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });
  const syncCms = useMutation({
    mutationFn: () => syncCmsFn(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.upserted} website pages`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });
  const syncRooms = useMutation({
    mutationFn: () => syncRoomsFn(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.upserted} rooms`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Sync failed"),
  });

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "archived" | "pending" }) =>
      setStatusFn({ data: v }),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Sync Engine"
        description="Connect Mtoni AI with approved sources — website pages, journal, rooms, and uploaded documents."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/admin/ai/knowledge" className="text-sm underline">
              Documents
            </Link>
            <Link to="/admin/ai/knowledge/test" className="text-sm underline">
              Test
            </Link>
            <Link to="/admin/ai/knowledge/analytics" className="text-sm underline">
              Analytics
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <SectionCard title="Website (CMS pages)" description="Homepage, Rooms, Experiences, Gallery, and other published CMS pages.">
          <Button onClick={() => syncCms.mutate()} disabled={syncCms.isPending} className="w-full">
            <RefreshCw className={`mr-2 size-4 ${syncCms.isPending ? "animate-spin" : ""}`} /> Sync website
          </Button>
        </SectionCard>
        <SectionCard title="Journal" description="Published articles from the Mtoni Journal.">
          <Button onClick={() => syncJournal.mutate()} disabled={syncJournal.isPending} className="w-full">
            <RefreshCw className={`mr-2 size-4 ${syncJournal.isPending ? "animate-spin" : ""}`} /> Sync journal
          </Button>
        </SectionCard>
        <SectionCard title="Rooms" description="Active room descriptions and rates.">
          <Button onClick={() => syncRooms.mutate()} disabled={syncRooms.isPending} className="w-full">
            <RefreshCw className={`mr-2 size-4 ${syncRooms.isPending ? "animate-spin" : ""}`} /> Sync rooms
          </Button>
        </SectionCard>
      </div>

      <SectionCard title="Knowledge sources">
        <div className="mb-3 flex flex-wrap gap-2">
          <Input
            placeholder="Search titles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="website_page">Website pages</SelectItem>
              <SelectItem value="journal_article">Journal</SelectItem>
              <SelectItem value="room">Rooms</SelectItem>
              <SelectItem value="experience">Experiences</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="policy">Policies</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !q.data || q.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources match. Run a sync above to import from your website/journal.</p>
        ) : (
          <ul className="divide-y">
            {q.data.map((s) => {
              const Icon = TYPE_ICONS[s.source_type] ?? FileText;
              return (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="size-4 text-muted-foreground" />
                      <span className="font-medium">{s.title}</span>
                      <Badge variant={s.status === "approved" ? "default" : "secondary"}>{s.status}</Badge>
                      <Badge variant="outline">{s.source_type.replace("_", " ")}</Badge>
                    </div>
                    {s.url && <div className="mt-1 text-xs text-muted-foreground">{s.url}</div>}
                    {s.last_synced_at && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Last synced {new Date(s.last_synced_at).toLocaleString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {s.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => changeStatus.mutate({ id: s.id, status: "approved" })}
                      >
                        <Check className="mr-1 size-4" /> Approve
                      </Button>
                    )}
                    {s.status !== "archived" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => changeStatus.mutate({ id: s.id, status: "archived" })}
                      >
                        <Archive className="mr-1 size-4" /> Archive
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete "${s.title}"?`)) del.mutate(s.id);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}