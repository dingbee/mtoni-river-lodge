import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/os/LoadingState";
import { getCmsPage } from "@/domains/content/pages/pages.functions";
import { renderBlock } from "@/domains/content/pages/renderBlock";
import type { CmsBlockKind } from "@/domains/content/pages/blocks";

export const Route = createFileRoute("/_authenticated/admin/content/pages/$id/preview")({
  head: () => ({ meta: [{ title: "Preview — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: PagePreview,
});

function PagePreview() {
  const { id } = Route.useParams();
  const getFn = useServerFn(getCmsPage);
  const { data, isLoading } = useQuery({
    queryKey: ["admin.cms.page.preview", id],
    queryFn: () => getFn({ data: { id } }),
  });
  if (isLoading || !data) return <LoadingState />;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Preview · {data.page?.status}</p>
          <h1 className="font-display text-2xl text-foreground">{data.page?.title}</h1>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/content/pages/$id" params={{ id }}><ArrowLeft className="mr-1 h-4 w-4" /> Back to editor</Link>
        </Button>
      </div>
      <div className="rounded-lg border border-border bg-background">
        {(data.blocks ?? []).map((b) => (
          <div key={b.id}>{renderBlock({ id: b.id, kind: b.kind as CmsBlockKind, data: b.data })}</div>
        ))}
      </div>
    </div>
  );
}