import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_REGISTRY, type CmsBlockKind } from "@/domains/content/pages/blocks";

export function BlockPalette({ onAdd }: { onAdd: (kind: CmsBlockKind) => void }) {
  return (
    <aside className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-3 text-xs uppercase tracking-wider text-muted-foreground">Add block</h3>
      <div className="space-y-1">
        {(Object.values(BLOCK_REGISTRY)).map((b) => (
          <Button
            key={b.kind}
            variant="ghost"
            size="sm"
            className="w-full justify-start text-left"
            onClick={() => onAdd(b.kind)}
            title={b.description}
          >
            <Plus className="mr-2 h-3 w-3 shrink-0" />
            <span className="truncate">{b.label}</span>
          </Button>
        ))}
      </div>
    </aside>
  );
}