const DRAFT_PREFIX = "staynas.housekeeping.draft.v1";

export type HousekeepingInspectionDraft = {
  inspectionId: string;
  checks: Record<string, boolean>;
  notes: string;
  savedAt: number;
};

function key(inspectionId: string) {
  return `${DRAFT_PREFIX}.${inspectionId}`;
}

export function loadHousekeepingInspectionDraft(inspectionId: string): HousekeepingInspectionDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key(inspectionId));
    return raw ? (JSON.parse(raw) as HousekeepingInspectionDraft) : null;
  } catch {
    return null;
  }
}

export function saveHousekeepingInspectionDraft(draft: HousekeepingInspectionDraft): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key(draft.inspectionId), JSON.stringify(draft));
  } catch {
    // Draft persistence is best-effort; the server remains authoritative.
  }
}

export function clearHousekeepingInspectionDraft(inspectionId: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key(inspectionId));
  } catch {
    // Storage is optional.
  }
}

export function isHousekeepingOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function actionIdempotencyKey(action: string, taskId: string): string {
  return `hk:${action}:${taskId}:${crypto.randomUUID()}`;
}
