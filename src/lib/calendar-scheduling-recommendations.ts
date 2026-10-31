export interface SchedulingCandidate {
  userId: string;
  email: string;
}

export interface SchedulingEvent {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  assignee_id: string | null;
  status?: string | null;
}

export interface StaffScheduleRecommendation {
  userId: string;
  email: string;
  conflictCount: number;
  workloadCount: number;
  eligible: boolean;
  score: number;
  reasons: string[];
}

/** Advisory ranking only: callers must revalidate conflicts before saving a schedule. */
export function rankCalendarStaff(
  candidates: SchedulingCandidate[],
  events: SchedulingEvent[],
  startsAt: string,
  endsAt: string,
): StaffScheduleRecommendation[] {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error("A valid start and end time are required");
  }

  return candidates.map((candidate) => {
    const assigned = events.filter((event) => event.assignee_id === candidate.userId);
    const conflicts = assigned.filter((event) => {
      if (event.status === "cancelled") return false;
      const eventStart = Date.parse(event.starts_at);
      const eventEnd = Date.parse(event.ends_at);
      return Number.isFinite(eventStart) && Number.isFinite(eventEnd) && eventStart < end && eventEnd > start;
    });
    const workload = assigned.filter((event) => {
      if (event.status === "cancelled") return false;
      const eventStart = Date.parse(event.starts_at);
      return Number.isFinite(eventStart) &&
        new Date(eventStart).toISOString().slice(0, 10) === new Date(start).toISOString().slice(0, 10);
    }).length;
    const eligible = conflicts.length === 0;
    const reasons = conflicts.length
      ? [`${conflicts.length} overlapping assignment(s)`]
      : ["No overlapping assignment in the requested time window"];
    reasons.push(`${workload} existing assignment(s) on the same UTC date`);
    return {
      userId: candidate.userId,
      email: candidate.email,
      conflictCount: conflicts.length,
      workloadCount: workload,
      eligible,
      score: eligible ? 100 - workload * 10 : Math.max(0, 40 - conflicts.length * 20 - workload * 5),
      reasons,
    };
  }).sort((a, b) =>
    Number(b.eligible) - Number(a.eligible) ||
    b.score - a.score ||
    a.workloadCount - b.workloadCount ||
    a.email.localeCompare(b.email)
  );
}
