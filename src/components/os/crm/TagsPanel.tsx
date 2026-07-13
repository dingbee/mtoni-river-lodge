import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listGuestTags,
  createGuestTag,
  assignGuestTag,
  unassignGuestTag,
} from "@/lib/guests.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X } from "lucide-react";

export function TagsPanel({
  guestId,
  tags,
}: {
  guestId: string;
  tags: Array<{ id: string; label: string; color: string | null }>;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGuestTags);
  const createFn = useServerFn(createGuestTag);
  const assignFn = useServerFn(assignGuestTag);
  const unassignFn = useServerFn(unassignGuestTag);

  const tagsQ = useQuery({ queryKey: ["guest-tags-catalog"], queryFn: () => listFn() });
  const [newLabel, setNewLabel] = useState("");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["guest-summary", guestId] });

  const create = useMutation({
    mutationFn: async () => {
      const t = (await createFn({ data: { label: newLabel.trim() } })) as { id: string };
      await assignFn({ data: { guestId, tagId: t.id } });
    },
    onSuccess: () => {
      setNewLabel("");
      qc.invalidateQueries({ queryKey: ["guest-tags-catalog"] });
      invalidate();
    },
  });
  const assign = useMutation({
    mutationFn: (tagId: string) => assignFn({ data: { guestId, tagId } }),
    onSuccess: invalidate,
  });
  const unassign = useMutation({
    mutationFn: (tagId: string) => unassignFn({ data: { guestId, tagId } }),
    onSuccess: invalidate,
  });

  const assigned = new Set(tags.map((t) => t.id));
  const available = ((tagsQ.data as any[]) ?? []).filter((t) => !assigned.has(t.id));

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((t) => (
        <Badge key={t.id} variant="secondary" className="gap-1">
          {t.label}
          <button
            type="button"
            onClick={() => unassign.mutate(t.id)}
            aria-label={`Remove tag ${t.label}`}
            className="rounded hover:bg-background/40"
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" className="h-7">
            <Plus className="mr-1 size-3" /> Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 space-y-2">
          {available.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {available.map((t: any) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => assign.mutate(t.id)}
                  className="rounded-full bg-muted px-2 py-0.5 text-xs hover:bg-muted/70"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="New tag…"
              className="h-8"
            />
            <Button
              size="sm"
              disabled={newLabel.trim().length === 0 || create.isPending}
              onClick={() => create.mutate()}
            >
              Add
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}