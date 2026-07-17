import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { testKnowledgeQuery } from "@/domains/ai/knowledge-sync.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge/test")({
  head: () => ({
    meta: [{ title: "Knowledge Test — Mtoni AI" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: KnowledgeTestPage,
});

function KnowledgeTestPage() {
  const testFn = useServerFn(testKnowledgeQuery);
  const [q, setQ] = useState("");
  const m = useMutation({
    mutationFn: (query: string) => testFn({ data: { query, limit: 8 } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge Testing"
        description="Preview how Mtoni AI retrieves approved sources for a question."
        actions={
          <div className="flex gap-3 text-sm">
            <Link to="/admin/ai/knowledge/sync" className="underline">
              Sync
            </Link>
            <Link to="/admin/ai/knowledge/analytics" className="underline">
              Analytics
            </Link>
          </div>
        }
      />

      <SectionCard title="Ask a question">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim().length >= 3) m.mutate(q.trim());
          }}
        >
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. When was the last article published?" />
          <Button type="submit" disabled={m.isPending || q.trim().length < 3}>
            {m.isPending ? "Searching…" : "Test"}
          </Button>
        </form>
      </SectionCard>

      {m.data && (
        <SectionCard
          title={`Sources matched (${m.data.hits.length})`}
          description={`Confidence ${(m.data.confidence * 100).toFixed(0)}%`}
        >
          {m.data.hits.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matches — try re-syncing or adding a document.</p>
          ) : (
            <ul className="space-y-3">
              {m.data.hits.map((h) => (
                <li key={h.id} className="rounded border p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{h.title}</span>
                    <Badge variant="outline">{h.source_type.replace("_", " ")}</Badge>
                    <span className="text-xs text-muted-foreground">rank {h.rank.toFixed(3)}</span>
                  </div>
                  {h.url && <div className="text-xs text-muted-foreground">{h.url}</div>}
                  {h.summary && <p className="mt-2 text-sm">{h.summary}</p>}
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground line-clamp-6">
                    {h.content.slice(0, 500)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}
    </div>
  );
}