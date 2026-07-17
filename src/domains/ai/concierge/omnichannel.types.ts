export type ConciergeChannel = "web" | "whatsapp" | "email";

export type CommunicationDraftType =
  | "welcome"
  | "pre_arrival"
  | "activity_intro"
  | "transfer_info"
  | "follow_up"
  | "custom";

export type CommunicationDraftStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "sent"
  | "archived";

export type EscalationReason =
  | "low_confidence"
  | "complaint"
  | "payment_issue"
  | "complex_request"
  | "human_requested"
  | "other";

export type EscalationStatus = "open" | "assigned" | "in_progress" | "resolved" | "dismissed";

export interface ChannelRow {
  id: string;
  channel: ConciergeChannel;
  provider: string | null;
  display_name: string;
  status: "active" | "inactive" | "configuring" | "error";
  inbound_enabled: boolean;
  outbound_enabled: boolean;
  requires_approval: boolean;
  configuration: Record<string, unknown>;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CommunicationDraftRow {
  id: string;
  session_id: string | null;
  guest_id: string | null;
  booking_id: string | null;
  channel: ConciergeChannel;
  draft_type: CommunicationDraftType;
  subject: string | null;
  body: string;
  reasoning: string | null;
  supporting_context: Record<string, unknown>;
  status: CommunicationDraftStatus;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EscalationRow {
  id: string;
  session_id: string;
  guest_id: string | null;
  channel: ConciergeChannel;
  reason: EscalationReason;
  summary: string | null;
  ai_confidence: number | null;
  priority: 1 | 2 | 3;
  status: EscalationStatus;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}