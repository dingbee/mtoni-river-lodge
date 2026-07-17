export type ConciergeMemoryType =
  | "preference"
  | "interest"
  | "travel_style"
  | "communication_preference";

export type ConciergeMemoryStatus = "pending" | "approved" | "rejected" | "archived";

export type ConciergeMemorySource = "ai_suggested" | "staff" | "guest" | "import";

export interface ConciergeMemoryRow {
  id: string;
  guest_id: string | null;
  session_id: string | null;
  memory_type: ConciergeMemoryType;
  memory_key: string;
  memory_value: string;
  confidence: number;
  source: ConciergeMemorySource;
  status: ConciergeMemoryStatus;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConciergeMemoryInsight {
  memory_key: string;
  memory_type: ConciergeMemoryType;
  count: number;
}