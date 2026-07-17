import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askOperationsKnowledge } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/knowledge")({
  component: StaffKnowledge,
});

function StaffKnowledge() {
  const ask = useServerFn(askOperationsKnowledge);
  const [query, setQuery] = useState("");
  const m = useMutation({ mutationFn: (q: string) => ask({ data: { query: q } }) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Knowledge Assistant"
        description="Ask questions — answers come with citations from approved documents."
      />
      <SectionCard title="Ask">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim().length >= 3) m.mutate(query.trim());
          }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. How do we handle airport transfers?"
          />
          <Button type="submit" disabled={m.isPending || query.trim().length < 3}>
            {m.isPending ? "Searching…" : "Search"}
          </Button>
        </form>
      </SectionCard>
      {m.data && (
        <SectionCard title={`Results (${(m.data as any[]).length})`}>
          {(m.data as any[]).length ? (
            <ul className="space-y-3 text-sm">
              {(m.data as any[]).map((r: any) => (
                <li key={r.chunk_id} className="rounded border p-3">
                  <div className="text-xs uppercase text-muted-foreground">
                    {r.category_slug ?? "knowledge"} · {r.document_title}
                  </div>
                  <div className="mt-1 whitespace-pre-wrap">{r.content}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No matches. Try different wording.</p>
          )}
        </SectionCard>
      )}
    </div>
  );
}