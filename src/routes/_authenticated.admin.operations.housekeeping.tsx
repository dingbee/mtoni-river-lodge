import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Bell, Camera, CheckCircle2, CheckSquare2, Clock3, ImagePlus, Play, Trash2, UserRound, WandSparkles, XCircle } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { useCurrentUserRoles } from "@/lib/permissions";
import { useHousekeepingRealtime } from "@/lib/housekeeping-realtime";
import { actionIdempotencyKey, clearHousekeepingInspectionDraft, isHousekeepingOnline, loadHousekeepingInspectionDraft, saveHousekeepingInspectionDraft } from "@/lib/housekeeping-offline";
import { getHousekeepingDashboard, listHousekeepingIntelligence, listHousekeepingNotifications, markHousekeepingNotificationRead } from "@/lib/housekeeping-intelligence.functions";
import {
  assignHousekeepingTask,
  claimHousekeepingTask,
  completeHousekeepingTask,
  listHousekeepingStaff,
  listHousekeepingWork,
  startHousekeepingTask,
} from "@/lib/housekeeping-execution.functions";
import {
  listHousekeepingInspectionQueue,
  submitHousekeepingInspection,
} from "@/lib/housekeeping-inspection.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  listHousekeepingExceptions,
  reportHousekeepingException,
  resolveHousekeepingException,
} from "@/lib/housekeeping-exceptions.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/housekeeping")({
  head: () => ({ meta: [{ title: "Housekeeping — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: HousekeepingPage,
});

type WorkRow = {
  id: string;
  room_state_id: string;
  unit_label: string;
  room_id: string;
  room_name: string;
  booking_id: string | null;
  booking_reference: string | null;
  guest_name: string | null;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  priority: number;
  due_at: string | null;
  assignee_id: string | null;
  claimed_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  title: string;
  description: string | null;
};

type InspectionRow = {
  inspection_id: string;
  room_state_id: string;
  cleaning_task_id: string;
  attempt_no: number;
  status: "pending" | "passed" | "failed";
  unit_label: string;
  room_name: string;
  room_id: string;
  booking_id: string | null;
  booking_reference: string | null;
  guest_name: string | null;
  completed_at: string | null;
  checklist: Array<{ key: string; label: string; passed?: boolean }>;
  notes: string | null;
};

const CHECKLIST = [
  ["bedroom", "Bedroom clean and reset"],
  ["bathroom", "Bathroom clean and stocked"],
  ["linen", "Linen and towels complete"],
  ["amenities", "Amenities replenished"],
  ["floor", "Floor and surfaces clean"],
  ["fixtures", "Fixtures and equipment checked"],
  ["waste", "Waste removed"],
  ["overall", "Overall room presentation ready"],
] as const;

function priorityLabel(priority: number) {
  return priority === 1 ? "Rush" : priority === 2 ? "Normal" : "Low";
}

function HousekeepingPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useCurrentUserRoles();
  const isSupervisor = roles.some((r) => ["owner", "manager", "admin"].includes(r));

  const [view, setView] = useState<"work" | "inspection" | "exceptions" | "notifications">("work");
  const [exceptionRoom, setExceptionRoom] = useState<WorkRow | null>(null);
  const [exceptionType, setExceptionType] = useState<"dnd"|"discrepancy"|"damage"|"maintenance"|"lost_found"|"linen_amenity" | "">("");
  const [exceptionTitle, setExceptionTitle] = useState("");
  const [exceptionNotes, setExceptionNotes] = useState("");
  const [exceptionSeverity, setExceptionSeverity] = useState(2);
  const [exceptionEvidence, setExceptionEvidence] = useState<Array<{ path: string; signedUrl: string; name: string; contentType: string; size: number }>>([]);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [mineOnly, setMineOnly] = useState(true);
  const [noteTask, setNoteTask] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [inspectionId, setInspectionId] = useState<string | null>(null);
  const [inspectionChecks, setInspectionChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(CHECKLIST.map(([key]) => [key, false])),
  );
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  useHousekeepingRealtime(true);

  useEffect(() => {
    const sync = () => setOnline(isHousekeepingOnline());
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const listFn = useServerFn(listHousekeepingWork);
  const claimFn = useServerFn(claimHousekeepingTask);
  const startFn = useServerFn(startHousekeepingTask);
  const completeFn = useServerFn(completeHousekeepingTask);
  const assignFn = useServerFn(assignHousekeepingTask);
  const staffFn = useServerFn(listHousekeepingStaff);
  const inspectionListFn = useServerFn(listHousekeepingInspectionQueue);
  const dashboardFn = useServerFn(getHousekeepingDashboard);
  const intelligenceFn = useServerFn(listHousekeepingIntelligence);
  const notificationsFn = useServerFn(listHousekeepingNotifications);
  const markNotificationReadFn = useServerFn(markHousekeepingNotificationRead);
  const submitInspectionFn = useServerFn(submitHousekeepingInspection);
  const exceptionsListFn = useServerFn(listHousekeepingExceptions);
  const reportExceptionFn = useServerFn(reportHousekeepingException);
  const resolveExceptionFn = useServerFn(resolveHousekeepingException);

  const dashboard = useQuery({ queryKey: ["housekeeping-dashboard"], queryFn: () => dashboardFn(), refetchInterval: 60_000 });
  const intelligence = useQuery({ queryKey: ["housekeeping-intelligence"], queryFn: () => intelligenceFn(), refetchInterval: 60_000 });
  const notifications = useQuery({ queryKey: ["housekeeping-notifications"], queryFn: () => notificationsFn({ data: { limit: 50 } }), refetchInterval: 20_000 });

  const work = useQuery({
    queryKey: ["housekeeping-work", mineOnly],
    queryFn: () => listFn({ data: { mineOnly, includeCompleted: false } }),
    refetchInterval: 20_000,
  });

  const staff = useQuery({
    queryKey: ["housekeeping-staff"],
    queryFn: () => staffFn(),
    enabled: isSupervisor,
    staleTime: 60_000,
  });

  const exceptions = useQuery({
    queryKey: ["housekeeping-exceptions"],
    queryFn: () => exceptionsListFn({ data: { openOnly: true } }),
    refetchInterval: 20_000,
  });

  const inspections = useQuery({
    queryKey: ["housekeeping-inspection-queue"],
    queryFn: () => inspectionListFn(),
    enabled: isSupervisor,
    refetchInterval: 20_000,
  });

  const rows = useMemo(() => (work.data ?? []) as WorkRow[], [work.data]);
  const inspectionRows = useMemo(() => (inspections.data ?? []) as InspectionRow[], [inspections.data]);
  const exceptionRows = useMemo(() => (exceptions.data ?? []) as Array<any>, [exceptions.data]);
  const selectedInspection = inspectionRows.find((row) => row.inspection_id === inspectionId);
  const allPassed = CHECKLIST.every(([key]) => inspectionChecks[key]);

  async function addExceptionPhotos(files: FileList | null) {
    if (!files?.length || !exceptionRoom) return;
    setError(null);
    const selected = Array.from(files);
    if (exceptionEvidence.length + selected.length > 6) { setError("Attach up to 6 photographs per report."); return; }
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (selected.some((file) => !allowed.includes(file.type))) { setError("Use JPEG, PNG or WebP photographs."); return; }
    if (selected.some((file) => file.size > 8 * 1024 * 1024)) { setError("Each photograph must be 8 MB or smaller."); return; }
    setEvidenceBusy(true);
    const uploaded: Array<{ path: string; signedUrl: string; name: string; contentType: string; size: number }> = [];
    try {
      const { data: roomState, error: roomError } = await supabase.from("room_states").select("property_id").eq("id", exceptionRoom.room_state_id).single();
      if (roomError || !roomState?.property_id) throw new Error("Could not verify the room property. Refresh the task and try again.");
      for (const file of selected) {
        const ext = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
        const path = `${roomState.property_id}/${exceptionRoom.room_state_id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("housekeeping-evidence").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
        if (uploadError) throw uploadError;
        const { data: signed, error: signedError } = await supabase.storage.from("housekeeping-evidence").createSignedUrl(path, 3600);
        if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Photo uploaded but preview could not be prepared.");
        uploaded.push({ path, signedUrl: signed.signedUrl, name: file.name, contentType: file.type, size: file.size });
      }
      setExceptionEvidence((current) => [...current, ...uploaded]);
    } catch (e) {
      if (uploaded.length) await supabase.storage.from("housekeeping-evidence").remove(uploaded.map((item) => item.path));
      setError(e instanceof Error ? e.message : "Photograph upload failed.");
    } finally { setEvidenceBusy(false); }
  }

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["housekeeping-work"] }),
      qc.invalidateQueries({ queryKey: ["housekeeping-inspection-queue"] }),
      qc.invalidateQueries({ queryKey: ["housekeeping-exceptions"] }),
      qc.invalidateQueries({ queryKey: ["housekeeping-notifications"] }),
    ]);
  };

  async function run(action: () => Promise<unknown>) {
    setError(null);
    if (!isHousekeepingOnline()) {
      setError("You are offline. Reconnect before submitting housekeeping actions. Your inspection draft is saved locally.");
      return;
    }
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Housekeeping action failed");
    }
  }

  function openInspection(row: InspectionRow) {
    const draft = loadHousekeepingInspectionDraft(row.inspection_id);
    setInspectionId(row.inspection_id);
    setInspectionChecks(draft?.checks ?? Object.fromEntries(CHECKLIST.map(([key]) => [
      key,
      row.checklist.find((item) => item.key === key)?.passed ?? false,
    ])));
    setInspectionNotes(draft?.notes ?? row.notes ?? "");
    setError(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Housekeeping"
        description="Execute cleaning, inspect completed rooms, and control room readiness."
      />

      {!online && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm">
          <span className="font-medium">Offline mode.</span> The current worklist may be stale. Inspection drafts are saved on this device; reconnect before sending any action.
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Housekeeping operations</div>
          <div className="text-xs text-muted-foreground">
            Cleaning completion creates an inspection. Only a passed inspection makes a room ready.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={`rounded-lg border px-3 py-2 text-sm ${view === "work" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setView("work")}
          >
            Work
          </button>
          {isSupervisor && (
            <button
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${view === "inspection" ? "bg-primary text-primary-foreground" : "bg-background"}`}
              onClick={() => setView("inspection")}
            >
              <CheckSquare2 className="h-4 w-4" />
              Inspection {inspectionRows.length > 0 ? `(${inspectionRows.length})` : ""}
            </button>
          )}
          <button
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${view === "exceptions" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setView("exceptions")}
          >
            <AlertTriangle className="h-4 w-4" />
            Exceptions {exceptionRows.length > 0 ? `(${exceptionRows.length})` : ""}
          </button>
          <button
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${view === "notifications" ? "bg-primary text-primary-foreground" : "bg-background"}`}
            onClick={() => setView("notifications")}
          >
            <Bell className="h-4 w-4" />
            Notifications {((notifications.data ?? []) as any[]).filter((n) => !n.read_at).length > 0 ? `(${((notifications.data ?? []) as any[]).filter((n) => !n.read_at).length})` : ""}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[
          ["Active", dashboard.data?.active_tasks ?? 0],
          ["Unassigned", dashboard.data?.unassigned_tasks ?? 0],
          ["In progress", dashboard.data?.in_progress_tasks ?? 0],
          ["Overdue", dashboard.data?.overdue_tasks ?? 0],
          ["Inspection", dashboard.data?.inspection_pending ?? 0],
          ["Open exceptions", dashboard.data?.exceptions_open ?? 0],
          ["Rooms ready", dashboard.data?.rooms_ready ?? 0],
          ["Failed today", dashboard.data?.failed_inspections_today ?? 0],
        ].map(([label,value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold">{value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between rounded-xl border bg-card/70 px-4 py-3 text-xs">
        <span className="text-muted-foreground">Average cleaning time</span>
        <span className="font-semibold tabular-nums">{dashboard.data?.avg_cleaning_minutes ?? 0} min</span>
      </div>
      {(intelligence.data ?? []).length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-2 flex items-center gap-2"><WandSparkles className="h-4 w-4" /><div className="text-sm font-semibold">StayNas AI housekeeping signals</div></div>
          <div className="grid gap-2 lg:grid-cols-2">
            {(intelligence.data ?? []).slice(0,4).map((s:any) => (
              <div key={s.title} className="rounded-lg border p-3">
                <div className="flex justify-between gap-2"><span className="text-sm font-medium">{s.title}</span><span className="rounded-full border px-2 py-0.5 text-[10px] uppercase">{s.priority}</span></div>
                <p className="mt-1 text-xs text-muted-foreground">{s.reasoning}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {view === "work" && (
        <>
          <div className="flex gap-2">
            <button
              className={`rounded-lg border px-3 py-2 text-sm ${mineOnly ? "bg-primary text-primary-foreground" : "bg-background"}`}
              onClick={() => setMineOnly(true)}
            >
              My Work
            </button>
            {isSupervisor && (
              <button
                className={`rounded-lg border px-3 py-2 text-sm ${!mineOnly ? "bg-primary text-primary-foreground" : "bg-background"}`}
                onClick={() => setMineOnly(false)}
              >
                All Work
              </button>
            )}
          </div>

          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}

          {work.isLoading ? (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading housekeeping work…</div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <div className="font-medium">No active housekeeping work</div>
              <div className="mt-1 text-sm text-muted-foreground">Checked-out rooms will appear here when cleaning work is generated.</div>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((task) => (
                <article key={task.id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{task.unit_label}</div>
                      <div className="text-sm text-muted-foreground">{task.room_name}</div>
                      {task.guest_name && <div className="mt-1 text-sm">{task.guest_name}</div>}
                    </div>
                    <div className="text-right">
                      <span className="rounded-full border px-2 py-1 text-[11px] font-medium">
                        {priorityLabel(task.priority)}
                      </span>
                      <div className="mt-2 text-xs capitalize text-muted-foreground">{task.status.replace("_", " ")}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-lg border p-2"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{task.due_at ? new Date(task.due_at).toLocaleString() : "No due time"}</div>
                    <div className="rounded-lg border p-2"><UserRound className="mr-1 inline h-3.5 w-3.5" />{task.assignee_id ? "Assigned" : "Unassigned"}</div>
                  </div>

                  {isSupervisor && !mineOnly && (
                    <div className="mt-3 flex gap-2">
                      <select
                        className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                        value={task.assignee_id ?? ""}
                        onChange={(e) => {
                          if (e.target.value) run(() => assignFn({ data: { taskId: task.id, assigneeId: e.target.value } }));
                        }}
                      >
                        <option value="">Assign housekeeper…</option>
                        {(staff.data ?? []).map((person: any) => (
                          <option key={person.user_id} value={person.user_id}>{person.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {!task.assignee_id && (
                      <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground" onClick={() => run(() => claimFn({ data: { taskId: task.id, idempotencyKey: actionIdempotencyKey("claim", task.id) } }))}>
                        <UserRound className="h-4 w-4" /> Claim
                      </button>
                    )}
                    {task.status === "pending" && task.assignee_id && (
                      <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground" onClick={() => run(() => startFn({ data: { taskId: task.id, idempotencyKey: actionIdempotencyKey("start", task.id) } }))}>
                        <Play className="h-4 w-4" /> Start cleaning
                      </button>
                    )}
                    <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setExceptionRoom(task); setExceptionTitle(""); setExceptionNotes(""); setExceptionEvidence([]); setExceptionType(""); setError(null); }}>Report issue</button>                    {task.status === "in_progress" && (
                      <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground" onClick={() => setNoteTask(task.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Complete cleaning
                      </button>
                    )}
                  </div>

                  {noteTask === task.id && (
                    <div className="mt-3 rounded-lg border bg-muted/20 p-3">
                      <label className="text-xs font-medium">Cleaning note (optional)</label>
                      <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 min-h-20 w-full rounded-lg border bg-background p-2 text-sm" placeholder="Record anything the inspector should know…" />
                      <div className="mt-2 flex gap-2">
                        <button className="flex-1 rounded-lg border px-3 py-2 text-sm" onClick={() => { setNoteTask(null); setNote(""); }}>Cancel</button>
                        <button className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground" onClick={() => run(async () => {
                          await completeFn({ data: { taskId: task.id, note: note || undefined, idempotencyKey: crypto.randomUUID() } });
                          setNoteTask(null);
                          setNote("");
                        })}>Send to inspection</button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {view === "inspection" && isSupervisor && (
        <>
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {inspections.isLoading ? (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading inspection queue…</div>
          ) : inspectionRows.length === 0 ? (
            <div className="rounded-xl border p-8 text-center">
              <CheckSquare2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <div className="font-medium">No rooms awaiting inspection</div>
              <div className="mt-1 text-sm text-muted-foreground">Completed cleaning work will appear here for supervisor sign-off.</div>
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {inspectionRows.map((row) => (
                <article key={row.inspection_id} className="rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{row.unit_label}</div>
                      <div className="text-sm text-muted-foreground">{row.room_name}</div>
                      {row.guest_name && <div className="mt-1 text-sm">{row.guest_name}</div>}
                    </div>
                    <span className="rounded-full border px-2 py-1 text-[11px] font-medium">Awaiting inspection</span>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    Cleaning completed {row.completed_at ? new Date(row.completed_at).toLocaleString() : "recently"} · Attempt {row.attempt_no}
                  </div>
                  <button
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground"
                    onClick={() => openInspection(row)}
                  >
                    <CheckSquare2 className="h-4 w-4" /> Inspect room
                  </button>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      {selectedInspection && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border bg-card p-5 shadow-xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xl font-semibold">Inspect {selectedInspection.unit_label}</div>
                <div className="text-sm text-muted-foreground">{selectedInspection.room_name} · {selectedInspection.guest_name ?? "No current guest"}</div>
              </div>
              <button className="rounded-lg border p-2" onClick={() => setInspectionId(null)} aria-label="Close inspection"><XCircle className="h-5 w-5" /></button>
            </div>

            <div className="mt-5 space-y-2">
              {CHECKLIST.map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    checked={inspectionChecks[key]}
                    onChange={(e) => {
                      const next = { ...inspectionChecks, [key]: e.target.checked };
                      setInspectionChecks(next);
                      if (inspectionId) saveHousekeepingInspectionDraft({ inspectionId, checks: next, notes: inspectionNotes, savedAt: Date.now() });
                    }}
                    className="h-5 w-5"
                  />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>

            <textarea
              value={inspectionNotes}
              onChange={(e) => {
                const next = e.target.value;
                setInspectionNotes(next);
                if (inspectionId) saveHousekeepingInspectionDraft({ inspectionId, checks: inspectionChecks, notes: next, savedAt: Date.now() });
              }}
              className="mt-4 min-h-24 w-full rounded-lg border bg-background p-3 text-sm"
              placeholder="Inspection notes, defects, or re-clean instructions…"
            />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-destructive/30 px-4 py-3 text-sm font-medium text-destructive"
                onClick={() => run(async () => {
                  await submitInspectionFn({
                    data: {
                      inspectionId: selectedInspection.inspection_id,
                      passed: false,
                      checklist: CHECKLIST.map(([key]) => ({ key, passed: inspectionChecks[key] })),
                      notes: inspectionNotes || undefined,
                      idempotencyKey: crypto.randomUUID(),
                    },
                  });
                  clearHousekeepingInspectionDraft(selectedInspection.inspection_id);
                  setInspectionId(null);
                  setInspectionNotes("");
                })}
              >
                <XCircle className="h-4 w-4" /> Fail & re-clean
              </button>
              <button
                disabled={!allPassed}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => run(async () => {
                  await submitInspectionFn({
                    data: {
                      inspectionId: selectedInspection.inspection_id,
                      passed: true,
                      checklist: CHECKLIST.map(([key]) => ({ key, passed: inspectionChecks[key] })),
                      notes: inspectionNotes || undefined,
                      idempotencyKey: crypto.randomUUID(),
                    },
                  });
                  setInspectionId(null);
                  setInspectionNotes("");
                })}
              >
                <CheckCircle2 className="h-4 w-4" /> Pass & mark ready
              </button>
            </div>

            {!allPassed && <div className="mt-2 text-xs text-muted-foreground">All checklist items must pass before the room can be marked ready.</div>}
          </div>
        </div>
      )}


      {view === "notifications" && (
        <section className="space-y-3">
          {notifications.isLoading ? (
            <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading notifications…</div>
          ) : (notifications.data ?? []).length === 0 ? (
            <div className="rounded-xl border p-8 text-center">
              <Bell className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <div className="font-medium">No housekeeping notifications</div>
              <div className="mt-1 text-sm text-muted-foreground">Operational events for your role will appear here.</div>
            </div>
          ) : (
            <div className="space-y-2">
              {(notifications.data ?? []).map((item: any) => (
                <article key={item.id} className={`rounded-xl border bg-card p-4 ${item.read_at ? "opacity-70" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">{item.title}</div>
                      {item.body && <div className="mt-1 text-sm text-muted-foreground">{item.body}</div>}
                    </div>
                    {!item.read_at && (
                      <button
                        className="shrink-0 rounded-lg border px-3 py-2 text-xs"
                        onClick={() => run(async () => { await markNotificationReadFn({ data: { id: item.id } }); })}
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">{new Date(item.created_at).toLocaleString()}</div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {view === "exceptions" && (
        <div className="space-y-3">
          {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
          {exceptionRows.length === 0 ? (
            <div className="rounded-xl border p-8 text-center"><CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><div className="font-medium">No open housekeeping exceptions</div><div className="mt-1 text-sm text-muted-foreground">DND, discrepancies, damage, maintenance, lost & found, and linen/amenity issues will appear here.</div></div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">{exceptionRows.map((row) => (
              <article key={row.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><div className="text-lg font-semibold">{row.unit_label}</div><div className="text-sm text-muted-foreground">{row.room_name}</div></div><span className="rounded-full border px-2 py-1 text-[11px] font-medium capitalize">{row.exception_type.replace("_"," ")}</span></div>
                <div className="mt-3 font-medium">{row.title}</div>
                {row.notes && <div className="mt-1 text-sm text-muted-foreground">{row.notes}</div>}
                <HousekeepingEvidenceGallery evidence={row.evidence} />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground"><span>Severity {row.severity}</span><span>{new Date(row.created_at).toLocaleString()}</span></div>
                <button className="mt-3 w-full rounded-lg border px-3 py-2 text-sm" onClick={() => run(() => resolveExceptionFn({ data: { exceptionId: row.id, resolution: "Resolved from Housekeeping." } }))}>Mark resolved</button>
              </article>
            ))}</div>
          )}
        </div>
      )}

      {exceptionRoom && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div className="w-full rounded-t-2xl border bg-card p-5 shadow-xl sm:max-w-xl sm:rounded-2xl">
            <div className="flex items-start justify-between"><div><div className="text-xl font-semibold">Report issue — {exceptionRoom.unit_label}</div><div className="text-sm text-muted-foreground">{exceptionRoom.room_name}</div></div><button className="rounded-lg border p-2" onClick={() => setExceptionRoom(null)}><XCircle className="h-5 w-5" /></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <select className="rounded-lg border bg-background p-3 text-sm" value={exceptionType} onChange={(e) => setExceptionType(e.target.value as typeof exceptionType)}><option value="">Choose issue type…</option>
                    <option value="maintenance">Maintenance</option><option value="dnd">Do Not Disturb</option><option value="discrepancy">Room discrepancy</option><option value="damage">Damage</option><option value="lost_found">Lost & found</option><option value="linen_amenity">Linen / amenity</option></select>
              <select className="rounded-lg border bg-background p-3 text-sm" value={exceptionSeverity} onChange={(e) => setExceptionSeverity(Number(e.target.value))}><option value="1">Rush</option><option value="2">Normal</option><option value="3">Low</option></select>
            </div>
            <input value={exceptionTitle} onChange={(e) => setExceptionTitle(e.target.value)} className="mt-3 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Issue title" />
            <textarea value={exceptionNotes} onChange={(e) => setExceptionNotes(e.target.value)} className="mt-3 min-h-28 w-full rounded-lg border bg-background p-3 text-sm" placeholder="Details, location, missing item, damage description, or re-clean instructions…" />
            <div className="mt-4 space-y-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <div><div className="text-sm font-medium">Photographic evidence</div><div className="text-xs text-muted-foreground">Up to 6 photos · JPEG, PNG or WebP · 8 MB each</div></div>
                {evidenceBusy && <span className="text-xs text-muted-foreground">Uploading…</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm hover:bg-accent">
                  <Camera className="h-4 w-4" /> Take photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={evidenceBusy || exceptionEvidence.length >= 6} onChange={(e) => { void addExceptionPhotos(e.currentTarget.files); e.currentTarget.value = ""; }} />
                </label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm hover:bg-accent">
                  <ImagePlus className="h-4 w-4" /> Choose photos
                  <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={evidenceBusy || exceptionEvidence.length >= 6} onChange={(e) => { void addExceptionPhotos(e.currentTarget.files); e.currentTarget.value = ""; }} />
                </label>
              </div>
              {exceptionEvidence.length > 0 && <div className="grid grid-cols-3 gap-2">{exceptionEvidence.map((item) => (
                <div key={item.path} className="relative">
                  <img src={item.signedUrl} alt={item.name} className="aspect-square w-full rounded-md border object-cover" />
                  <button type="button" aria-label="Remove photograph" className="absolute right-1 top-1 rounded-full bg-background/90 p-1 shadow" onClick={async () => { await supabase.storage.from("housekeeping-evidence").remove([item.path]); setExceptionEvidence((current) => current.filter((photo) => photo.path !== item.path)); }}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}</div>}
            </div>
            <button disabled={exceptionTitle.trim().length < 2 || !exceptionType || evidenceBusy} className="mt-3 w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground disabled:opacity-50" onClick={() => run(async () => { await reportExceptionFn({ data: { roomStateId: exceptionRoom.room_state_id, taskId: exceptionRoom.id, exceptionType, title: exceptionTitle, notes: exceptionNotes || undefined, severity: exceptionSeverity, evidence: exceptionEvidence.map(({ path, name, contentType, size }) => ({ path, name, contentType, size })) } }); setExceptionRoom(null); setExceptionEvidence([]); })}>Report exception</button>
          </div>
        </div>
      )}
      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <WandSparkles className="mr-1 inline h-3.5 w-3.5" />
        Readiness is controlled: dirty → cleaning task → inspection → passed = ready, or failed → re-clean → inspection.
      </div>
    </div>
  );
}


function HousekeepingEvidenceGallery({ evidence }: { evidence: unknown }) {
  const [photos, setPhotos] = useState<Array<{ path: string; name: string; url: string }>>([]);
  useEffect(() => {
    let active = true;
    const items = Array.isArray(evidence) ? evidence.filter((item): item is { path: string; name?: string } => !!item && typeof item === "object" && typeof (item as any).path === "string") : [];
    if (!items.length) { setPhotos([]); return; }
    void Promise.all(items.map(async (item) => {
      const { data, error } = await supabase.storage.from("housekeeping-evidence").createSignedUrl(item.path, 3600);
      return !error && data?.signedUrl ? { path: item.path, name: item.name ?? "Housekeeping evidence", url: data.signedUrl } : null;
    })).then((results) => { if (active) setPhotos(results.filter((item): item is { path: string; name: string; url: string } => item !== null)); });
    return () => { active = false; };
  }, [evidence]);
  if (!photos.length) return null;
  return <div className="mt-3 grid grid-cols-3 gap-2">{photos.map((photo) => <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" className="block"><img src={photo.url} alt={photo.name} className="aspect-square w-full rounded-md border object-cover" /></a>)}</div>;
}
