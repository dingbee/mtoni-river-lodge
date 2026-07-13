import { createFileRoute, Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listGuests } from "@/lib/guests.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DirectoryTable, type GuestRow } from "@/components/os/crm/DirectoryTable";
import { Users, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/guests/crm")({
  head: () => ({
    meta: [{ title: "Guest CRM — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: CrmLayout,
});

function CrmLayout() {
  const matchRoute = useMatchRoute();
  const onChild = Boolean(
    matchRoute({ to: "/admin/guests/crm/$id" }) ||
      matchRoute({ to: "/admin/guests/crm/duplicates" }),
  );
  if (onChild) return <Outlet />;
  return <GuestDirectory />;
}

function GuestDirectory() {
  const fn = useServerFn(listGuests);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "new" | "returning" | "vip">("all");
  const [sort, setSort] = useState<
    "last_stay_desc" | "name_asc" | "total_stays_desc" | "lifetime_spend_desc" | "created_desc"
  >("last_stay_desc");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const params = useMemo(() => ({ q, status, sort, page, pageSize, tagIds: [] }), [q, status, sort, page]);
  const query = useQuery({
    queryKey: ["guests-directory", params],
    queryFn: () => fn({ data: params as any }),
  });

  const rows = ((query.data as any)?.rows ?? []) as GuestRow[];
  const total = (query.data as any)?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Guest CRM"
        description="Every guest across every stay, in one directory."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/guests/crm/duplicates">
              <AlertCircle className="mr-2 size-4" /> Duplicates
            </Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder="Search name, email, phone, country…"
          aria-label="Search guests"
        />
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="min-w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="returning">Returning</SelectItem>
            <SelectItem value="vip">VIP</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as any)}>
          <SelectTrigger className="min-w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="last_stay_desc">Last stay · newest</SelectItem>
            <SelectItem value="name_asc">Name · A→Z</SelectItem>
            <SelectItem value="total_stays_desc">Most stays</SelectItem>
            <SelectItem value="lifetime_spend_desc">Lifetime spend</SelectItem>
            <SelectItem value="created_desc">Recently added</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isLoading ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Loading guests…</div>
      ) : query.isError ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          {(query.error as Error)?.message ?? "Failed to load guests."}
        </div>
      ) : (
        <>
          <DirectoryTable rows={rows} />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="size-4" aria-hidden />
              {total.toLocaleString()} guests
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span>
                Page {page} of {pageCount}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}