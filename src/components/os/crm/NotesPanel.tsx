import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { createGuestNote, updateGuestNote, deleteGuestNote } from "@/lib/guests.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Pencil, History as HistoryIcon, X, Check } from "lucide-react";

type Note = {
  id: string;
  body: string;
  author_id: string | null;
  created_at: string;
  updated_at: string;
  history: Array<{ at: string; author_id: string | null; body: string }>;
};

function fmt(d: string) {
  return new Date(d).toLocaleString();
}

export function NotesPanel({ guestId, notes }: { guestId: string; notes: Note[] }) {
  const qc = useQueryClient();
  const createFn = useServerFn(createGuestNote);
  const updateFn = useServerFn(updateGuestNote);
  const deleteFn = useServerFn(deleteGuestNote);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [historyOpen, setHistoryOpen] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["guest-summary", guestId] });

  const createM = useMutation({
    mutationFn: () => createFn({ data: { guestId, body: draft.trim() } }),
    onSuccess: () => { setDraft(""); invalidate(); },
  });
  const updateM = useMutation({
    mutationFn: (id: string) => updateFn({ data: { id, body: editBody.trim() } }),
    onSuccess: () => { setEditingId(null); invalidate(); },
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
  });

  return (
    <section aria-label="Guest notes" className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <label htmlFor="new-note" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Add a staff note
        </label>
        <Textarea
          id="new-note"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Preferences, arrival details, celebrations…"
          rows={3}
          className="mt-2"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            disabled={draft.trim().length === 0 || createM.isPending}
            onClick={() => createM.mutate()}
          >
            {createM.isPending ? "Saving…" : "Add note"}
          </Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      ) : (
        <ul className="space-y-3">
          {notes.map((n) => (
            <li key={n.id} className="rounded-lg border bg-card p-4">
              {editingId === n.id ? (
                <div className="space-y-2">
                  <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={3} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      <X className="mr-1 size-3" /> Cancel
                    </Button>
                    <Button size="sm" onClick={() => updateM.mutate(n.id)}>
                      <Check className="mr-1 size-3" /> Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{fmt(n.updated_at ?? n.created_at)}</span>
                    <div className="flex items-center gap-1">
                      {n.history?.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setHistoryOpen((v) => (v === n.id ? null : n.id))}
                          aria-label="Show edit history"
                        >
                          <HistoryIcon className="size-3" />
                          <span className="ml-1">{n.history.length}</span>
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                        aria-label="Edit note"
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => deleteM.mutate(n.id)}
                        aria-label="Delete note"
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </div>
                  {historyOpen === n.id && n.history?.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
                      {n.history.map((h, i) => (
                        <li key={i}>
                          <div className="text-[10px] uppercase tracking-wide">{fmt(h.at)}</div>
                          <div className="whitespace-pre-wrap">{h.body}</div>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}