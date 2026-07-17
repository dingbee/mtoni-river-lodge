import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { Plus, Save, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  listCalendarEntries, saveCalendarEntry, rescheduleCalendarEntry, deleteCalendarEntry,
  type CalendarEntryInput, type CalendarEntryType,
} from "@/domains/content/calendar/calendar.functions";

export const Route = createFileRoute("/_authenticated/admin/content/calendar")({
  head: () => ({ meta: [{ title: "Content Calendar — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: ContentCalendar,
});

const TYPES: CalendarEntryType[] = ["journal", "homepage", "campaign", "promotion", "social", "other"];
const TYPE_COLOR: Record<string, string> = {
  journal: "bg-blue-100 text-blue-900 border-blue-200",
  homepage: "bg-emerald-100 text-emerald-900 border-emerald-200",
  campaign: "bg-purple-100 text-purple-900 border-purple-200",
  promotion: "bg-amber-100 text-amber-900 border-amber-200",
  social: "bg-pink-100 text-pink-900 border-pink-200",
  other: "bg-slate-100 text-slate-900 border-slate-200",
};

function toDateKey(d: Date) {
  const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, "0"); const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d); const day = x.getDay(); x.setDate(x.getDate() - day); x.setHours(0, 0, 0, 0); return x;
}

type Entry = Awaited<ReturnType<typeof listCalendarEntries>>[number];

function ContentCalendar() {
  const listFn = useServerFn(listCalendarEntries);
  const saveFn = useServerFn(saveCalendarEntry);
  const rescheduleFn = useServerFn(rescheduleCalendarEntry);
  const delFn = useServerFn(deleteCalendarEntry);
  const qc = useQueryClient();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<CalendarEntryInput | null>(null);

  const { data: entries, isLoading } = useQuery({
    queryKey: ["admin.calendar"],
    queryFn: () => listFn(),
  });

  const reschedule = useMutation({
    mutationFn: (v: { id: string; scheduled_at: string }) => rescheduleFn({ data: v }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["admin.calendar"] });
      const prev = qc.getQueryData<Entry[]>(["admin.calendar"]);
      qc.setQueryData<Entry[]>(["admin.calendar"], (list) =>
        (list ?? []).map((e) => (e.id === v.id ? { ...e, scheduled_at: v.scheduled_at } : e)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(["admin.calendar"], ctx.prev); toast.error("Reschedule failed"); },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin.calendar"] }),
  });

  const save = useMutation({
    mutationFn: (payload: CalendarEntryInput) => saveFn({ data: payload }),
    onSuccess: () => { toast.success("Entry saved"); qc.invalidateQueries({ queryKey: ["admin.calendar"] }); setEditing(null); },
    onError: (e: unknown) => toast.error((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { toast.success("Entry removed"); qc.invalidateQueries({ queryKey: ["admin.calendar"] }); setEditing(null); },
  });

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i); return d;
  }), [weekStart]);

  const byDay = useMemo(() => {
    const map: Record<string, Entry[]> = {};
    for (const d of days) map[toDateKey(d)] = [];
    for (const e of entries ?? []) {
      const k = e.scheduled_at.slice(0, 10);
      if (map[k]) map[k].push(e);
    }
    return map;
  }, [days, entries]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !active) return;
    const id = String(active.id);
    const newDate = String(over.id);
    const entry = (entries ?? []).find((e) => e.id === id);
    if (!entry) return;
    const oldDate = entry.scheduled_at.slice(0, 10);
    if (oldDate === newDate) return;
    // preserve time-of-day
    const time = entry.scheduled_at.slice(10);
    reschedule.mutate({ id, scheduled_at: `${newDate}${time || "T09:00:00Z"}` });
  };

  const shift = (n: number) => { const x = new Date(weekStart); x.setDate(x.getDate() + n * 7); setWeekStart(x); };

  return (
    <div className="space-y-6">
      <PageHeader title="Content Calendar" description="Unified drag-and-drop schedule across journal, homepage, campaigns and social." />

      <SectionCard
        title={`Week of ${toDateKey(weekStart)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Today</Button>
            <Button size="sm" variant="ghost" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button size="sm" onClick={() => setEditing({ entry_type: "journal", title: "", scheduled_at: `${toDateKey(days[0])}T09:00:00Z` })}>
              <Plus className="h-4 w-4 mr-1" />New entry
            </Button>
          </div>
        }
      >
        {isLoading ? <LoadingState /> : (
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
              {days.map((d) => {
                const key = toDateKey(d);
                return <DayColumn key={key} date={d} dateKey={key} entries={byDay[key] ?? []} onEdit={(e) => setEditing({ ...(e as unknown as CalendarEntryInput), id: e.id })} />;
              })}
            </div>
          </DndContext>
        )}
      </SectionCard>

      <EntryDialog
        entry={editing}
        onClose={() => setEditing(null)}
        onSave={(v) => save.mutate(v)}
        onDelete={(id) => remove.mutate(id)}
        saving={save.isPending}
      />
    </div>
  );
}

function DayColumn({ date, dateKey, entries, onEdit }: { date: Date; dateKey: string; entries: Entry[]; onEdit: (e: Entry) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: dateKey });
  const isToday = dateKey === toDateKey(new Date());
  return (
    <div
      ref={setNodeRef}
      className={`rounded-md border p-2 min-h-[180px] transition-colors ${isOver ? "bg-accent" : "bg-card"}`}
    >
      <div className={`text-xs font-medium mb-2 ${isToday ? "text-primary" : "text-muted-foreground"}`}>
        {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
      </div>
      <div className="space-y-1.5">
        {entries.map((e) => <EntryCard key={e.id} entry={e} onEdit={onEdit} />)}
        {!entries.length && <div className="text-[11px] text-muted-foreground italic">Drop here</div>}
      </div>
    </div>
  );
}

function EntryCard({ entry, onEdit }: { entry: Entry; onEdit: (e: Entry) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entry.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const tone = TYPE_COLOR[entry.entry_type] ?? TYPE_COLOR.other;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onDoubleClick={() => onEdit(entry)}
      className={`rounded border px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing ${tone} ${isDragging ? "opacity-60" : ""}`}
      title="Drag to reschedule · double-click to edit"
    >
      <div className="font-medium truncate">{entry.title}</div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="capitalize opacity-70">{entry.entry_type}</span>
        <span className="opacity-70">{entry.scheduled_at.slice(11, 16)}</span>
      </div>
    </div>
  );
}

function EntryDialog({
  entry, onClose, onSave, onDelete, saving,
}: {
  entry: CalendarEntryInput | null;
  onClose: () => void;
  onSave: (v: CalendarEntryInput) => void;
  onDelete: (id: string) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CalendarEntryInput | null>(entry);
  // sync on prop change
  useMemo(() => setForm(entry), [entry]);
  if (!entry || !form) return null;
  const update = <K extends keyof CalendarEntryInput>(k: K, v: CalendarEntryInput[K]) => setForm((p) => (p ? { ...p, [k]: v } : p));
  const dateVal = form.scheduled_at.slice(0, 10);
  const timeVal = form.scheduled_at.slice(11, 16) || "09:00";
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{form.id ? "Edit calendar entry" : "New calendar entry"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Title</Label><Input value={form.title} onChange={(e) => update("title", e.target.value)} /></div>
          <div>
            <Label>Type</Label>
            <Select value={form.entry_type} onValueChange={(v) => update("entry_type", v as CalendarEntryType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Date</Label><Input type="date" value={dateVal} onChange={(e) => update("scheduled_at", `${e.target.value}T${timeVal}:00Z`)} /></div>
            <div><Label>Time</Label><Input type="time" value={timeVal} onChange={(e) => update("scheduled_at", `${dateVal}T${e.target.value}:00Z`)} /></div>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status ?? "planned"} onValueChange={(v) => update("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["planned", "in_review", "scheduled", "published", "archived"].map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Linked type</Label><Input value={form.linked_type ?? ""} onChange={(e) => update("linked_type", e.target.value)} placeholder="journal_article" /></div>
            <div><Label>Linked id</Label><Input value={form.linked_id ?? ""} onChange={(e) => update("linked_id", e.target.value)} /></div>
          </div>
          <div><Label>Notes</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => update("notes", e.target.value)} /></div>
          {form.id && <Badge variant="secondary">Tip: drag the card in the week view to reschedule.</Badge>}
        </div>
        <DialogFooter>
          {form.id && (
            <Button variant="ghost" onClick={() => onDelete(form.id!)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
          )}
          <Button onClick={() => onSave(form)} disabled={!form.title || saving}>
            <Save className="h-4 w-4 mr-1" />Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}