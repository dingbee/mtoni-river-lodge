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
  | "marketing.seo_status"
  | "knowledge.search";

export type AiDomain = "guests" | "reservations" | "finance" | "operations" | "marketing" | "knowledge";

export interface AiKnowledgeCitation {
  document_id: string;
  document_title: string;
  document_slug: string;
  category_slug: string | null;
  chunk_index: number;
  excerpt: string;
}

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
  data?: any;
  model: string;
  citations?: AiKnowledgeCitation[];
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