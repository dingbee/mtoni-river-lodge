import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { findDuplicateGuests } from "@/lib/guests.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/guests/crm/duplicates")({
  head: () => ({
    meta: [{ title: "Duplicate guests — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: DuplicatesPage,
});

function DuplicatesPage() {
  const fn = useServerFn(findDuplicateGuests);
  const q = useQuery({ queryKey: ["guest-duplicates"], queryFn: () => fn() });
  const clusters = (q.data as any[]) ?? [];

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/admin/guests/crm"><ArrowLeft className="mr-2 size-4" /> Directory</Link>
      </Button>
      <PageHeader
        title="Possible duplicates"
        description="Guests that share a phone number or a similar name. Review before merging — no changes are made automatically."
      />
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Scanning…</p>
      ) : clusters.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No potential duplicates found. Nice.
        </div>
      ) : (
        <ul className="space-y-3">
          {clusters.map((c, i) => (
            <li key={i} className="rounded-lg border bg-card p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Match: {c.match_type} · key {c.cluster_key}
              </div>
              <ul className="mt-2 space-y-1">
                {c.guest_ids.map((gid: string, idx: number) => (
                  <li key={gid} className="flex items-center justify-between gap-3 text-sm">
                    <span>
                      <Link to="/admin/guests/crm/$id" params={{ id: gid }} className="hover:underline">
                        {c.sample_names?.[idx] ?? "Guest"}
                      </Link>
                      <span className="ml-2 text-muted-foreground">{c.sample_emails?.[idx] ?? ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}