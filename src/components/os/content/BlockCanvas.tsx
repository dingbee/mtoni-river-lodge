import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BLOCK_REGISTRY } from "@/domains/content/pages/blocks";
import { renderBlock } from "@/domains/content/pages/renderBlock";
import type { BlockDraft } from "./types";

interface Props {
  blocks: BlockDraft[];
  selectedId: string | null;
  onSelect: (uid: string) => void;
  onReorder: (blocks: BlockDraft[]) => void;
  onDuplicate: (uid: string) => void;
  onRemove: (uid: string) => void;
  previewWidth: number;
}

export function BlockCanvas({
  blocks,
  selectedId,
  onSelect,
  onReorder,
  onDuplicate,
  onRemove,
  previewWidth,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = blocks.findIndex((b) => b.uid === active.id);
    const newIndex = blocks.findIndex((b) => b.uid === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(blocks, oldIndex, newIndex));
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="mx-auto overflow-hidden rounded-md border border-border bg-background transition-all" style={{ maxWidth: previewWidth }}>
        {blocks.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            No blocks yet — add one from the palette on the left.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleEnd}>
            <SortableContext items={blocks.map((b) => b.uid)} strategy={verticalListSortingStrategy}>
              {blocks.map((b) => (
                <SortableBlockItem
                  key={b.uid}
                  block={b}
                  selected={selectedId === b.uid}
                  onSelect={() => onSelect(b.uid)}
                  onDuplicate={() => onDuplicate(b.uid)}
                  onRemove={() => onRemove(b.uid)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

function SortableBlockItem({
  block,
  selected,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  block: BlockDraft;
  selected: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.uid });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const label = BLOCK_REGISTRY[block.kind]?.label ?? block.kind;
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`group relative border-b border-border last:border-b-0 cursor-pointer ${selected ? "ring-2 ring-primary ring-inset" : ""}`}
    >
      <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-background/80 px-2 py-1 text-xs opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100">
        <button
          type="button"
          className="pointer-events-auto flex items-center rounded p-0.5 hover:bg-muted"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3 w-3" />
        </button>
        <span className="font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onDuplicate(); }} aria-label="Duplicate block">
          <Copy className="h-3 w-3" />
        </Button>
        <Button size="sm" variant="secondary" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); onRemove(); }} aria-label="Delete block">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <div className="pointer-events-none">{renderBlock({ kind: block.kind, data: block.data })}</div>
    </div>
  );
}