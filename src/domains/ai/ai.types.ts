export type AiToolId =
  | "guest.search"
  | "guest.summary"
  | "reservations.arrivals_today"
  | "reservations.departures_today"
  | "reservations.upcoming"
  | "reservations.occupancy"
  | "finance.revenue_summary"
  | "finance.outstanding"
  | "finance.recent_transactions"
  | "operations.room_status"
  | "operations.open_tasks"
  | "operations.alerts"
  | "marketing.latest_articles"
  | "marketing.seo_status";

export type AiDomain = "guests" | "reservations" | "finance" | "operations" | "marketing";

export interface AiEvidenceSource {
  domain: AiDomain;
  tool: AiToolId;
  count?: number;
  window?: string;
  note?: string;
}

export interface AiResponse {
  answer: string;
  evidence: AiEvidenceSource[];
  recommendation?: string;
  tool?: AiToolId;
  data?: unknown;
  model: string;
}

export interface AiActivityRow {
  id: string;
  user_id: string;
  question: string;
  domains_accessed: string[];
  tool_called: string | null;
  response: string | null;
  recommendation: string | null;
  model: string | null;
  status: string;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
}