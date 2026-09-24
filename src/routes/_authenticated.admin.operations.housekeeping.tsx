import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Clock3, Play, UserRound, WandSparkles } from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { useCurrentUserRoles } from "@/lib/permissions";
import {
  assignHousekeepingTask,
  claimHousekeepingTask,
  completeHousekeepingTask,
  listHousekeepingStaff,
  listHousekeepingWork,
  startHousekeepingTask,
} from "@/lib/housekeeping-execution.functions";

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

function priorityLabel(priority: number) {
  return priority === 1 ? "Rush" : priority === 2 ? "Normal" : "Low";
}

function HousekeepingPage() {
  const qc = useQueryClient();
  const { data: roles = [] } = useCurrentUserRoles();
  const isSupervisor = roles.some((r) => ["owner", "manager"].includes(r));

  const [mineOnly, setMineOnly] = useState(true);
  const [noteTask, setNoteTask] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listFn = useServerFn(listHousekeepingWork);
  const claimFn = useServerFn(claimHousekeepingTask);
  const startFn = useServerFn(startHousekeepingTask);
  const completeFn = useServerFn(completeHousekeepingTask);
  const assignFn = useServerFn(assignHousekeepingTask);
  const staffFn = useServerFn(listHousekeepingStaff);

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

  const rows = useMemo(() => (work.data ?? []) as WorkRow[], [work.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["housekeeping-work"] });

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Housekeeping action failed");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Housekeeping"
        description="Mobile-first room work queue. Claim, clean, and hand rooms to inspection."
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Staff execution</div>
          <div className="text-xs text-muted-foreground">Cleaning stays task-driven; completion moves the room to inspection.</div>
        </div>
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
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-medium ${task.priority === 1 ? "border-rose-500/30 bg-rose-500/10 text-rose-700" : "border-muted bg-muted/30"}`}>
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
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground" onClick={() => run(() => claimFn({ data: { taskId: task.id } }))}>
                    <UserRound className="h-4 w-4" /> Claim
                  </button>
                )}
                {task.status === "pending" && task.assignee_id && (
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground" onClick={() => run(() => startFn({ data: { taskId: task.id } }))}>
                    <Play className="h-4 w-4" /> Start cleaning
                  </button>
                )}
                {task.status === "in_progress" && (
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

      <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground">
        <WandSparkles className="mr-1 inline h-3.5 w-3.5" />
        Housekeeping execution is governed by StayNas permissions and the room-readiness state machine. Supervisors control assignment; attendants control their own cleaning lifecycle.
      </div>
    </div>
  );
}
