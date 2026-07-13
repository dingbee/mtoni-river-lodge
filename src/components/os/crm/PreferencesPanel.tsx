import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listGuestPreferences,
  upsertGuestPreference,
  deleteGuestPreference,
} from "@/lib/guest-intelligence.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2 } from "lucide-react";

const CATS = ["room", "dining", "service", "accessibility", "other"] as const;

export function PreferencesPanel({ guestId }: { guestId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listGuestPreferences);
  const upsertFn = useServerFn(upsertGuestPreference);
  const delFn = useServerFn(deleteGuestPreference);
  const q = useQuery({
    queryKey: ["guest-prefs", guestId],
    queryFn: () => listFn({ data: { id: guestId } }),
  });
  const rows = ((q.data as any[]) ?? []);

  const [category, setCategory] = useState<(typeof CATS)[number]>("room");
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["guest-prefs", guestId] });

  const add = useMutation({
    mutationFn: () => upsertFn({ data: { guestId, category, key: key.trim(), value: value.trim() } }),
    onSuccess: () => { setKey(""); setValue(""); invalidate(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No preferences captured yet.</p>
        ) : (
          <ul className="divide-y">
            {rows.map((p: any) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="w-24 text-xs uppercase tracking-wide text-muted-foreground">{p.category}</span>
                <span className="w-40 font-medium">{p.key}</span>
                <span className="flex-1 text-muted-foreground">{p.value}</span>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(p.id)} aria-label={`Remove ${p.key}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (key.trim() && value.trim()) add.mutate(); }}
        className="grid gap-2 sm:grid-cols-[140px_1fr_1fr_auto]"
      >
        <Select value={category} onValueChange={(v) => setCategory(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. Bed type" aria-label="Preference key" />
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. King, river-view" aria-label="Preference value" />
        <Button type="submit" disabled={!key.trim() || !value.trim() || add.isPending}>Save</Button>
      </form>
    </div>
  );
}